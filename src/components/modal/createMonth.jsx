import Image from "next/image"
import calendario from '../../../public/calendario.png'
import { useRef, useState, useEffect } from "react"
import { useUser } from "@/Domain/userContext";



export default function CreateMonth({ setMonth, isUpdate, month, setEditCompra, setSelected }) {
  const mesRef = useRef();
  const budgetRef = useRef();
  const { createMonth,updateMonth } = useUser();
  const [dateMessage, setDateMessage] = useState('')
  const [values, setValues] = useState(["", "", "", "", "", ""]);

  useEffect(() => {
    if (isUpdate && month) {
      const [monthPart, yearPart] = month.date.split('/');
      const newValues = [...monthPart.split(''), ...yearPart.split('')];
      setValues(newValues);
      budgetRef.current.value = month.budget
    }
  }, [isUpdate, month]);


  const KEYBOARDS = {
    backspace: 8,
    arrowLeft: 37,
    arrowRight: 39,
  };
  const handleChange = (index, value) => {
    const newValues = [...values];
    newValues[index] = value;

    setValues(newValues);

    if (value && index < 5) {
      document.querySelector(`#input-${index + 1}`).focus();
    }
  };

  const handleKeyDown = (index, e) => {
    switch (e.keyCode) {
      case KEYBOARDS.backspace:
        if (!values[index]) {
          if (index > 0) {
            document.querySelector(`#input-${index - 1}`).focus();
            handleChange(index - 1, "");
          }
        }
        break;
      case KEYBOARDS.arrowLeft:
        if (index > 0) {
          document.querySelector(`#input-${index - 1}`).focus();
        }
        break;
      case KEYBOARDS.arrowRight:
        if (index < 5) {
          document.querySelector(`#input-${index + 1}`).focus();
        }
        break;
      default:
    }
  };


  async function handleClick() {
    if (!isUpdate) {
      const data = {
        date: values[0] + values[1] + '/' + values[2] + values[3] + values[4] + values[5],
        budget: budgetRef.current.value,
        spent: 0,
        compras: JSON.stringify([])
      }

      const newMonth = await createMonth(data);
      if (newMonth) {
        setMonth(newMonth);
      }
    } else {
      const updatedMonth = await updateMonth(month.id,budgetRef.current.value);
      setSelected()
      setEditCompra()
      setMonth(updatedMonth);

    }
  }

  function handleBack() {
    setSelected()
    setEditCompra()
  }

  return (
    <div className="w-3/5 h-4/5">
      {isUpdate ? <>
        <div className="w-full flex justify-end">
          <h1 onClick={() => handleBack()} className="cursor-pointer text-xl font-bold hover:scale-125 transition-all duration-300 ease-out">X</h1>
        </div>
      </> : <></>}
      <div className="flex flex-col items-center justify-evenly h-[85%] w-full">
        <Image src={calendario} width={100} height={100} />
        {isUpdate ? <h1 className="text-4xl font-semibold">Update Mes</h1> : <h1 className="text-4xl font-semibold">Novo Mes</h1>}
        <div className="w-2/3 flex flex-col  ">
          <h3 className="ml-12">Data: </h3>
          <div className="flex flex-row justify-center w-full ">
            {values.map((value, index) => (
              <>
                <input
                  key={index}
                  id={`input-${index}`}
                  pattern="[0-9]"
                  maxLength="1"
                  className={`text-black border-2 border-black w-[10%] h-[80%] pl-4 rounded-lg bg-tx mr-2 font-bold ${isUpdate ? 'cursor-not-allowed' : ''}`}
                  value={value}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isUpdate} // Disable input when isUpdate is true
                />
                {index === 1 ? <div className="h-14 w-7 text-5xl">/</div> : <></>}
              </>
            ))}
          </div>
          <h3 style={{ color: dateMessage === 'Mes Invalido' || dateMessage === 'Ano deve Conter 4 Digitos' ? 'red' : 'black' }}>
            {dateMessage}
          </h3>
        </div>
        <div className="w-1/2">
          <h3 className="ml-1">Budget do mes: </h3>
          <input
            ref={budgetRef}
            type="number"
            placeholder="Budget: "
            className="bg-tx px-2 w-full h-10 text-Dark rounded-lg"
          />
        </div>
        <button
          onClick={() => handleClick()}
          className="bg-Secundary w-1/2 h-10 rounded-xl hover:scale-110 transition-all ease-out duration-200 mt-4"
        >
          {isUpdate ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </div>
  )
}
