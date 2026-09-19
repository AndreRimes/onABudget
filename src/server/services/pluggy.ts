// Thin HTTP client for the Pluggy API (Open Finance Brasil, free Meu Pluggy
// tier). No persistence and no TRPCError here — callers own both, exactly as
// brapi.ts relates to MarketCacheService.
//
// The free tier is read-only from this app's point of view: accounts are
// connected by the user at meu.pluggy.ai, and we only ever list what already
// exists. Nothing here can create a connection or see bank credentials.
import { env } from "~/env";
import {
  upstreamRequestDuration,
  upstreamRequestsInFlight,
  upstreamRequestsTotal,
  type UpstreamOperation,
} from "~/server/metrics/instruments";
import { countUpstreamCall, responseOutcome } from "~/server/metrics/upstream";

const PLUGGY_BASE_URL = "https://api.pluggy.ai";
const FETCH_TIMEOUT_MS = 20_000;
const PROVIDER = "pluggy" as const;

/** Stop paginating no matter what, so a broken cursor cannot loop forever. */
const MAX_PAGES = 40;

/** Credentials are missing or rejected — permanent until the operator fixes it. */
export class PluggyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluggyAuthError";
  }
}

/** Pluggy is unreachable or returned a server error (transient). */
export class PluggyUpstreamError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "PluggyUpstreamError";
    this.status = status;
  }
}

export interface PluggyItem {
  id: string;
  status: string;
  connector: { id: number; name: string; imageUrl?: string | null };
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt: string | null;
  /** When the Open Finance consent stops working and must be renewed. */
  consentExpiresAt?: string | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  subtype: string;
  number: string | null;
  name: string;
  marketingName: string | null;
  balance: number;
  currencyCode: string;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw: string | null;
  amount: number;
  currencyCode: string;
  type: "DEBIT" | "CREDIT";
  status: "PENDING" | "POSTED" | null;
  category?: string | null;
  categoryId?: string | null;
}

export type PluggyInvestmentType =
  | "COE"
  | "EQUITY"
  | "ETF"
  | "FIXED_INCOME"
  | "MUTUAL_FUND"
  | "SECURITY"
  | "OTHER";

export interface PluggyInvestment {
  id: string;
  itemId: string;
  name: string;
  code: string | null;
  currencyCode: string | null;
  type: PluggyInvestmentType;
  subtype: string | null;
  quantity: number | null;
  value: number | null;
  amount: number;
  balance: number;
  date: string | null;
  dueDate: string | null;
  /**
   * When the position was opened, and what was paid for it. Present for most
   * fixed-income products and some brokerage ones; both are optional because a
   * connector that omits them is common, and a holding without them cannot be
   * imported as an opening position at all.
   */
  issueDate?: string | null;
  amountOriginal?: number | null;
  amountProfit?: number | null;
  rate: number | null;
  rateType: "CDI" | "SELIC" | "DOLAR" | "EURO" | "IGPM" | "IPCA" | null;
  fixedAnnualRate: number | null;
}

export type PluggyInvestmentTransactionType =
  | "BUY"
  | "SELL"
  | "TAX"
  | "TRANSFER"
  | "INTEREST"
  | "AMORTIZATION";

export interface PluggyInvestmentTransaction {
  id?: string | null;
  type: PluggyInvestmentTransactionType;
  description?: string | null;
  quantity: number;
  value: number;
  amount: number;
  date: string;
  tradeDate: string;
}

interface PageResponse<T> {
  results?: T[];
  page?: number;
  totalPages?: number;
}

/**
 * v2 list shape: a page of results plus an opaque cursor, null on the last
 * page. The cursor is fed back as `after`.
 */
interface CursorResponse<T> {
  results?: T[];
  next?: string | null;
}

/**
 * fetch with a hard timeout and the same instrumentation brapi.ts uses, so a
 * stalled bank connector can never hang a request. Labelled by operation only —
 * never by item, account or user, which would grow a series per bank account.
 */
async function pluggyFetch(
  path: string,
  operation: UpstreamOperation,
  init: RequestInit = {},
): Promise<Response> {
  const labels = { provider: PROVIDER, operation };
  const stop = upstreamRequestDuration.startTimer(labels);
  upstreamRequestsInFlight.inc({ provider: PROVIDER });
  countUpstreamCall();

  try {
    const response = await fetch(`${PLUGGY_BASE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    upstreamRequestsTotal.inc({
      ...labels,
      outcome: responseOutcome(response),
      status_class: `${Math.floor(response.status / 100)}xx`,
    });

    return response;
  } catch (error) {
    const outcome =
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "network_error";
    upstreamRequestsTotal.inc({ ...labels, outcome, status_class: "none" });
    throw error;
  } finally {
    stop();
    upstreamRequestsInFlight.dec({ provider: PROVIDER });
  }
}

/**
 * API keys are valid for about two hours. Cached in module scope with an early
 * expiry, mirroring the in-process guards in MarketCacheService: one auth call
 * per process per couple of hours instead of one per sync.
 */
let cachedKey: { value: string; expiresAt: number } | null = null;
const KEY_TTL_MS = 100 * 60 * 1000; // 100 min, comfortably inside the 2h life

/** True when the deployment is configured to talk to Pluggy at all. */
export function hasPluggyCredentials(): boolean {
  return !!env.PLUGGY_CLIENT_ID && !!env.PLUGGY_CLIENT_SECRET;
}

async function getApiKey(): Promise<string> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.value;
  if (!hasPluggyCredentials()) {
    throw new PluggyAuthError("Credenciais do Pluggy não configuradas");
  }

  const response = await pluggyFetch("/auth", "auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env.PLUGGY_CLIENT_ID,
      clientSecret: env.PLUGGY_CLIENT_SECRET,
    }),
  });

  // 400 counts as an auth failure here, not a transient one: this request's
  // body contains nothing but the credentials, and Pluggy answers 400 (not
  // 401) to a malformed clientId. Treating it as "try again later" would send
  // the operator chasing an outage that is really a typo in .env.
  if ([400, 401, 403].includes(response.status)) {
    const detail = await response
      .json()
      .then((body: { message?: string }) => body?.message)
      .catch(() => null);
    throw new PluggyAuthError(
      detail
        ? `Credenciais do Pluggy inválidas (${detail})`
        : "Credenciais do Pluggy inválidas",
    );
  }
  if (!response.ok) {
    throw new PluggyUpstreamError(
      `Pluggy auth failed with ${response.status}`,
      response.status,
    );
  }

  const body = (await response.json()) as { apiKey?: string };
  if (!body.apiKey) {
    throw new PluggyUpstreamError("Pluggy auth returned no apiKey");
  }

  cachedKey = { value: body.apiKey, expiresAt: Date.now() + KEY_TTL_MS };
  return body.apiKey;
}

/**
 * GET with the API key attached. A 401 means the cached key died early (the
 * app was idle past its life, or it was revoked), so the key is dropped and the
 * call retried once — otherwise every sync after an expiry would fail until
 * the process restarted.
 */
async function authedGet<T>(
  path: string,
  operation: UpstreamOperation,
  retryOnUnauthorized = true,
): Promise<T> {
  const apiKey = await getApiKey();
  const response = await pluggyFetch(path, operation, {
    headers: { "X-API-KEY": apiKey },
  });

  if (response.status === 401 && retryOnUnauthorized) {
    cachedKey = null;
    return authedGet<T>(path, operation, false);
  }
  if (response.status === 401 || response.status === 403) {
    throw new PluggyAuthError("Acesso negado pelo Pluggy");
  }
  if (!response.ok) {
    throw new PluggyUpstreamError(
      `Pluggy ${path} failed with ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

/**
 * One connection by id.
 *
 * Note there is deliberately no "list every item" call: the free Meu Pluggy
 * tier answers 401 to `GET /items`, and only ever exposes connector 200
 * (MeuPluggy). Items are therefore discovered through the Connect widget,
 * which hands back the id, and re-read individually from then on.
 */
export async function getItem(itemId: string): Promise<PluggyItem | null> {
  try {
    return await authedGet<PluggyItem>(`/items/${itemId}`, "items");
  } catch (error) {
    // A consent revoked at meu.pluggy.ai leaves a stored id pointing at
    // nothing; the caller marks the connection instead of failing the page.
    if (error instanceof PluggyUpstreamError && error.status === 404)
      return null;
    throw error;
  }
}

/**
 * Short-lived token that authorises the Connect widget in the browser.
 *
 * The widget runs with this, never with the client secret, so the credentials
 * stay server-side.
 */
export async function createConnectToken(): Promise<string> {
  const apiKey = await getApiKey();
  const response = await pluggyFetch("/connect_token", "auth", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new PluggyUpstreamError(
      `Pluggy connect_token failed with ${response.status}`,
      response.status,
    );
  }

  const body = (await response.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new PluggyUpstreamError("Pluggy returned no connect token");
  }
  return body.accessToken;
}

/** Accounts inside one connection (checking, savings, credit card). */
export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const body = await authedGet<PageResponse<PluggyAccount>>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    "bank_accounts",
  );
  return body.results ?? [];
}

/**
 * Every transaction for one account in a window, following the cursor to the
 * end. Pluggy keeps roughly 12 months of history, so a `from` older than that
 * simply returns what exists.
 *
 * This is `/v2/transactions`: the v1 endpoint now answers 410 GONE, and v2
 * changed the contract rather than just the path — the window is `dateFrom`/
 * `dateTo` (not `from`/`to`), paging is an opaque `after` cursor (not
 * `page`/`pageSize`), and passing any of the old parameters is a hard 400.
 */
export async function listTransactions(params: {
  accountId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      accountId: params.accountId,
      dateFrom: params.from,
      dateTo: params.to,
    });
    if (after) query.set("after", after);

    const body: CursorResponse<PluggyTransaction> = await authedGet<
      CursorResponse<PluggyTransaction>
    >(`/v2/transactions?${query.toString()}`, "bank_transactions");

    all.push(...(body.results ?? []));

    after = body.next ?? null;
    if (!after) break;
  }

  return all;
}

/** All investment holdings collected for one Pluggy item. */
export async function listInvestments(
  itemId: string,
): Promise<PluggyInvestment[]> {
  const all: PluggyInvestment[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await authedGet<PageResponse<PluggyInvestment>>(
      `/investments?${new URLSearchParams({
        itemId,
        page: String(page),
        pageSize: "500",
      }).toString()}`,
      "investments",
    );
    all.push(...(body.results ?? []));
    if (!body.totalPages || page >= body.totalPages) break;
  }
  return all;
}

/** Every recorded movement for one investment holding. */
export async function listInvestmentTransactions(
  investmentId: string,
): Promise<PluggyInvestmentTransaction[]> {
  const all: PluggyInvestmentTransaction[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await authedGet<PageResponse<PluggyInvestmentTransaction>>(
      `/investments/${encodeURIComponent(investmentId)}/transactions?${new URLSearchParams(
        {
          page: String(page),
          pageSize: "500",
        },
      ).toString()}`,
      "investment_transactions",
    );
    all.push(...(body.results ?? []));
    if (!body.totalPages || page >= body.totalPages) break;
  }
  return all;
}
