import { useState, useEffect } from "react";
import { useUser } from "@/Domain/userContext";

export default function CompraInput({
    month,
    setMonth,
    setIsInput,
    dateValue,
    categoriaValue,
    storeValue,
    priceValue,
    setEditCompra,
    index
}) {
    const { addCompra } = useUser();

    const [date, setDate] = useState(dateValue || "");
    const [store, setStore] = useState(storeValue || "");
    const [categoria, setCategoria] = useState(categoriaValue || "");
    const [price, setPrice] = useState(priceValue || "");

    useEffect(() => {
        setDate(dateValue || "");
        setStore(storeValue || "");
        setCategoria(categoriaValue || "");
        setPrice(priceValue || "");
    }, [dateValue, storeValue, categoriaValue, priceValue]);

    async function handleClick() {
        const compra = {
            store,
            date,
            categoria,
            price: parseInt(price)
        };
        const newMonth = await addCompra(compra, month, index);
        setMonth(newMonth);
       
        setDate("");
        setStore("");
        setCategoria("");
        setPrice("");
        setEditCompra(-1)
        setIsInput(false);
    }

    return (
        <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-5">
            <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-[11%] px-1 text-black bg-tx rounded-md"
            />
            <input
                value={store}
                onChange={(e) => setStore(e.target.value)}
                className="w-[11%] px-1 text-black bg-tx rounded-md"
            />
            <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-[11%] px-1 text-black bg-tx rounded-md"
            />
            <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-[11%] px-1 text-black bg-tx rounded-md"
            />
            <button onClick={handleClick} className="bg-Secundary rounded-md w-[11%]">
                Salvar
            </button>
        </div>
    );
}
