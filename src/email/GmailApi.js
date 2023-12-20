import axios from "axios";
import qs from "qs";
require('dotenv').config();


function extractTransactionInfo(inputString) {
  const transactionPattern = /\d+\.\d+/;
  const merchantPattern = /<b> Merchant: <\/b>\s*([^<]+)\s*<br><br>/;

  const transactionMatch = inputString.match(transactionPattern);
  const merchantMatch = inputString.match(merchantPattern);

  const merchant = merchantMatch ? merchantMatch[1] : null;


  return {
      transactionAmount: parseFloat(transactionMatch[0]),
      merchant: merchant
  };
}

class GmailAPI {
  accessToken = "";

  constructor() {
    this.accessToken = this.getAccessToken();
  }

  readCredentialsFromFile = (filePath) => {
    try {
      const rawData = fs.readFileSync(filePath);
      return JSON.parse(rawData);
    } catch (error) {
      console.error('Error reading credentials file:', error);
      return {};
    }
  };


  getAccessToken = async () => {

    const data = qs.stringify({
      client_id:  process.env.NEXT_PUBLIC_CLIENT_ID,
      client_secret: process.env.NEXT_PUBLIC_CLIENT_SECRET,
      refresh_token: process.env.NEXT_PUBLIC_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });
    
    var config = {
      method: "post",
      url: "https://accounts.google.com/o/oauth2/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
    };

    let accessToken = "";

    await axios(config)
      .then(async function (response) {
        accessToken = await response.data.access_token;

      })
      .catch(function (error) {
        console.log("ERRO NO getAcceToken")
        console.log(error);
      });

    return accessToken;
  };

  searchGmail = async (searchItem) => {
    var config1 = {
      method: "get",
      url:
        "https://www.googleapis.com/gmail/v1/users/me/messages?q=" + searchItem,
      headers: {
        Authorization: `Bearer ${await this.accessToken} `,
      },
    };
    
    let messages = ''
    await axios(config1)
      .then(async function (response) {
        messages = await response.data["messages"];
      })
      .catch(function (error) {
        console.log("ERRO NO searchGmail")
        console.log(error);
      });

      return messages;
  };

  readGmailContent = async (messageId) => {
    var config = {
      method: "get",
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      headers: {
        Authorization: `Bearer ${await this.accessToken}`,
      },
    };

    var data = {};

    await axios(config)
      .then(async function (response) {
        data = await response.data;
      })
      .catch(function (error) {
        console.log(error);
        console.log("ERRO NO readGmailContent")
      });

    return data;
  };

  readInboxContent = async (searchText,lastSearch) => {
    
    const messages = await this.searchGmail(searchText);
    const compras = []
    const searchDate = new Date(lastSearch)
    const daySearch =  searchDate.getDate()
    const monthSearch = searchDate.getMonth() + 1
    const yearSearch  = searchDate.getFullYear()

    
    for(let i = 0; i< messages.length; i++){
        const message = await this.readGmailContent(messages[i].threadId); 
        const encodedMessage = await message.payload.body.data
        const decodedStr = Buffer.from(encodedMessage, "base64").toString("ascii");
        const date = new Date(message.payload.headers[16].value)
        var day = date.getDate()
        var month = (date.getMonth() + 1)
        var year = date.getFullYear()

        if(lastSearch === '' || yearSearch < year || monthSearch < month || daySearch < day ){
          const transactionInfo = extractTransactionInfo(decodedStr);
          const compra = {
            categoria: '',
            date: day.toString() + "/" + month.toString() + '/' + yearSearch.toString(),
            price: transactionInfo.transactionAmount,
            store : transactionInfo.merchant
          }
          compras.push(compra)
        }
    }

     console.log(compras);
     return compras;
  };
}

export default new GmailAPI();