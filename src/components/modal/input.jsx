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

    const [date, setDate] = useState(dateValue?.split('/')[0] || "");
    const [store, setStore] = useState(storeValue || "");
    const [categoria, setCategoria] = useState(categoriaValue || "");
    const [price, setPrice] = useState(priceValue || "");
    const [meessage, setMessage] = useState('')

    useEffect(() => {
        setDate(dateValue?.split('/')[0] || "");
        setStore(storeValue || "");
        setCategoria(categoriaValue || "");
        setPrice(priceValue || "");
    }, [dateValue, storeValue, categoriaValue, priceValue]);

    async function handleClick() {
        const compra = {
            store,
            date: date + '/' + month.date,
            categoria,
            price: parseInt(price)
        };
        const newMonth = await addCompra(compra, month, index);
        setMonth(newMonth);

        setDate("");
        setStore("");
        setCategoria("");
        setPrice("");
        setEditCompra(-2)
        setIsInput(false);
    }

    function handleChangeDate(e) {
        if (e.target.value.length <= 2) {
            const newDate = e.target.value;
            setDate(newDate);

            const parsedDate = parseInt(newDate);
            if (1 > parsedDate || parsedDate > 31) {
                setMessage('Data Invalida');
            } else {
                setMessage('');
            }
        }
    }


    function handleChangestore(e) {
        if (e.target.value.length < 13) {
            setStore(e.target.value);
        }
    }

    function handleChangeCategoria(e) {
        if (e.target.value.length < 13) {
            setCategoria(e.target.value);
        }
    }



    return (
        <>
            <div className={`w-1/3 flex items-center justify-center rounded-2xl mb-2 text-black ${meessage === 'Data Invalida' ? 'bg-Error' : ''} `}> {meessage} </div>
            <div key={index} className="w-[95%] lg:w-2/3 min-h-[48px] h-12 bg-Primary flex flex-row items-center justify-between px-2 lg:px-10 rounded-2xl mb-5 " >
                <div className="w-[20%] md:w-[15%] h-6 flex flex-row">
                    <input
                        type="number"
                        value={date}
                        onChange={(e) => handleChangeDate(e)}
                        className="w-[25px] lg:w-[30%] mr-1 px-1 text-black bg-tx rounded-md"
                    />
                    /{month.date.slice(0,3) + month.date.slice(5) }
                </div>
                <input
                    value={store}
                    onChange={(e) => handleChangestore(e)}
                    className="w-[11%] px-1 text-black bg-tx rounded-md"
                />
                <input
                    value={categoria}
                    onChange={(e) => handleChangeCategoria(e)}
                    className="w-[11%] px-1 text-black bg-tx rounded-md"
                />
                <input
                    type='number'
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-[11%] px-1 text-black bg-tx rounded-md"
                />
                <button onClick={handleClick} className="bg-Secundary rounded-md w-[15%] lg:w-[11%] hover:scale-110 transition-all duration-300 ease-out">
                    Salvar
                </button>
            </div>
        </>
    );
}
