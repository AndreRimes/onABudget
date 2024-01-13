import Overlay from "./overlay"
import { useState } from "react";
import { useUser } from "@/Domain/userContext";



export default function ModalTutorial({setMonth}) {
    const currentDate = new Date();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentYear = String(currentDate.getFullYear());
    const [values, setValues] = useState([currentMonth[0], currentMonth[1], currentYear[0], currentYear[1], currentYear[2], currentYear[3]]);
    const [budget, setBudget] = useState('')
    const { createMonth } = useUser();


    function handleChangeBudget(e) {
        const inputValue = e.target.value;

        if (!isNaN(inputValue)) {
            setBudget(inputValue);
        }
    }

    async function handleClick() {
        const data = {
            date: values[0] + values[1] + '/' + values[2] + values[3] + values[4] + values[5],
            budget: parseInt(budget),
            spent: 0,
            compras: JSON.stringify([])
        }

        const newMonth = await createMonth(data);
        if (newMonth) {
            setMonth(newMonth);
        }
    }

    return (
        <Overlay setIsModalOpen={null}>
            <div onClick={(e) => e.stopPropagation()} className="bg-Dark animate-dropTop text-white w-2/3 h-5/6 rounded-2xl flex items-center  flex-col ">
                <div className="h-1/2 w-1/2 flex flex-col items-center justify-evenly">
                    <h1 className="text-2xl">Ola Bem Vindo ao On A Budget</h1>
                    <p className="text-lg text-center">Vamos Configurar o app para que voce tenha uma melhor experiencia. Vamos comecar criando um mes atual</p>
                </div>
                <div className="w-full h-1/5 flex flex-col items-center justify-between">
                    <div className="w-1/2 flex flex-row justify-center ">
                        {values.map((value, index) => (
                            <div key={index} className={`flex flex-row justify-center w-[100%] `}>
                                <div className="input-group text-tx">
                                    <input
                                        type="text"
                                        id={`input-${index}`}
                                        pattern="[0-9]"
                                        className={`text-tx border-2 w-[80%] h-[100%] p-2 rounded-lg mr-2 font-bold input cursor-not-allowed ${value.length !== 0 ? 'inputFocus' : ''}`}
                                        style={{ color: 'white' }}
                                        value={value}
                                        disabled={true}
                                        maxLength="1"
                                    />
                                    <label className={`user-label ${value.length !== 0 ? 'labelFocus' : ''} `}> {index <= 1 ? 'M' : 'Y'} </label>
                                </div>
                                {index === 1 && <div className="h-full w-14 mr-4 flex items-center justify-center text-center text-5xl">/</div>}
                            </div>
                        ))}
                    </div>
                    <div className="w-1/2">
                        <div className="input-group">
                            <input
                                type="text"
                                className={`w-full input ${budget.length !== 0 ? 'inputFocus' : ''}`}
                                onChange={(e) => handleChangeBudget(e)}
                                value={budget}
                            />
                            <label className={`user-label ${budget.length !== 0 ? 'labelFocus' : ''} `}>Budget</label>
                        </div>
                    </div>
                </div>


                <button
                    onClick={() => handleClick()}
                    className={`w-1/2 h-10 rounded-xl mt-10 ${values.some(value => value === "") || budget === "" ? 'bg-gray-500 cursor-not-allowed' : 'bg-Secundary hover:scale-110 transition-all ease-out duration-200'}`}
                    disabled={values.some(value => value === "") || budget === ""}
                >
                    Criar
                </button>


            </div>
        </Overlay>
    )

}