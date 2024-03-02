import Overlay from "./overlay"
import { useState } from "react";
import CompraInput from "./input";
import Image from "next/image";
import dots from '../../../public/3Dots.png'
import CreateMonth from "./createMonth";
import lixo from '../../../public/lixo.png'
import edit from '../../../public/edit.png'
import { useUser } from "@/Domain/userContext";
import StyledContainer from "../scrollBar";
import Error from "../error";

export default function Modal({ setIsModalOpen, month, setMonth }) {
    const [isInput, setIsInput] = useState();
    const [selected, setSelected] = useState()
    const { deleteCompra, deleteMonth } = useUser();
    const [editCompra, setEditCompra] = useState(-2)
    const [error, setError] = useState()

    async function handleDelete(index, month) {
        const deletedMonth = await deleteCompra(index, month)
        setMonth(deletedMonth);
    }


    async function handleDeleteMonth(id) {
        const res = await deleteMonth(id);
        if (res === "Erro: Mes atual nao pode ser deletado, mas pode ser editado") {
            setError(res)
        } else {
            setIsModalOpen(false);
            setMonth({})
        }
    }


    return (
        <Overlay setIsModalOpen={setIsModalOpen}>
            <div onClick={(e) => e.stopPropagation()} className="bg-Dark animate-dropTop text-white w-[95%] lg:w-2/3 h-5/6 rounded-2xl flex flex-col items-center justify-center ">
                <div  className="w-10/12 flex justify-end">
                    <p onClick={() => setIsModalOpen(false)} className="cursor-pointer font-bold text-xl hover:scale-110 transition-all duration-200 ease-out">X</p>
                </div>
                {editCompra === -1 ? <>
                    <CreateMonth setMonth={setMonth} isUpdate={true} month={month} setEditCompra={setEditCompra} setSelected={setSelected} />
                </> : <>
                    {Object.keys(month).length === 0 ? <CreateMonth setMonth={setMonth} isUpdate={false} month={month} /> : (<>
                        <div className="w-full h-[90%] flex flex-col items-center justify-evenly">
                            {error && <Error message={error} />}
                            {/* HEADER */}
                            <div className="w-full h-[50%] flex items-center justify-center">
                                <div className="w-[95%] lg:w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-2 lg:px-10 rounded-2xl mb-10 ">
                                    <h3 className="w-[15%] lg:w-[5%]  flex items-center justify-center">Data</h3>
                                    <h3 className="w-[15%] lg:w-[5%]  flex items-center justify-center">Loja</h3>
                                    <h3 className="w-[15%] lg:w-[11%] flex items-center justify-center">Categoria</h3>
                                    <h3 className="w-[15%] lg:w-[11%] flex items-center justify-center">Preco</h3>
                                    <div className="w-[10%] flex items-center justify-center">
                                        {selected === -1 ?
                                            <>
                                                <Image onClick={() => handleDeleteMonth(month.id)} className="mr-4 cursor-pointer" src={lixo} width={24} height={24} alt='delete Month' />
                                                <Image onClick={() => setEditCompra(-1)} className="cursor-pointer" src={edit} width={24} height={24} alt='edit month' />

                                            </> : (<>
                                                <Image src={dots} alt='3 dots' className="cursor-pointer w-1/2 h-1/2 " onClick={() => setSelected(-1)} />
                                            </>)}
                                    </div>
                                </div>
                            </div>

                            {/* BODY */}
                            <StyledContainer>
                                <div className="w-full h-[90vh] min-h-[50vh] max-h-[50vh] overflow-y-auto flex flex-col items-center justify-start">
                                    {isInput && <CompraInput index={-1} setEditCompra={setEditCompra} dateValue={''} categoriaValue={''} storeValue={''} priceValue={''} setMonth={setMonth} setIsInput={setIsInput} month={month} />}
                                    {month && month.compras && month.compras.map((compra, index) => (
                                        editCompra === index ?
                                            <>
                                                <CompraInput key={index} index={index} setEditCompra={setEditCompra} dateValue={compra.date} categoriaValue={compra.categoria} storeValue={compra.store} priceValue={compra.price} setMonth={setMonth} setIsInput={setIsInput} month={month} />
                                            </>
                                            :
                                            <div key={index} className="w-[95%] lg:w-2/3 min-h-[48px] h-12 bg-Primary flex flex-row items-center justify-between px-2 lg:px-10 rounded-2xl mb-5" >
                                                <h3 className="ml-2 w-[15%] lg:w-[5%] h-full flex items-center justify-center">{compra.date.slice(0, 6) + compra.date.slice(8, 10)}</h3>
                                                <h3 className="h-full flex items-center justify-center text-center">
                                                    {compra.store.length > 10 ? `${compra.store.slice(0, 10)}...` : compra.store}
                                                </h3>
                                                <h3 className="w-[15%] lg:w-[5%] flex items-center justify-center">{compra.categoria}</h3>
                                                <h3 className="w-[15%] lg:w-[5%] h-full flex items-center justify-center">${(compra.price)?.toFixed(2)}</h3>
                                                <div className="w-[10%] h-full flex items-center justify-center">
                                                    {selected === index ?
                                                        <>
                                                            <Image onClick={() => handleDelete(index, month)} className="mr-4 cursor-pointer" src={lixo} width={24} height={24} alt='delete purchase' />
                                                            <Image onClick={() => setEditCompra(index)} className="cursor-pointer" src={edit} width={24} height={24} alt='edit purchase' />
                                                        </>
                                                        : <>
                                                            <Image src={dots} alt='3 dots' className="cursor-pointer w-1/2 h-1/2 " onClick={() => setSelected(index)} />
                                                        </>}
                                                </div>
                                            </div>
                                    ))}
                                </div>
                            </StyledContainer>
                            <div className="font-semibold text-3xl w-2/3 flex justify-end mt-2">
                                <span onClick={() => setIsInput(!isInput)} className="hover:scale-125 transition-all duration-300 ease-out h-10 w-10 p-0 rounded-full bg-Primary flex items-center justify-center cursor-pointer">+</span>
                            </div>
                        </div>
                    </>)}
                </>}
            </div>

        </Overlay>
    )
}
