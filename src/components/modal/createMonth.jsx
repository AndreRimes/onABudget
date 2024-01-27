import Image from "next/image"
import calendario from '../../../public/calendario.png'
import { useState, useEffect } from "react"
import { useUser } from "@/Domain/userContext";
import Error from "../error";

export default function CreateMonth({ setMonth, isUpdate, month, setEditCompra, setSelected }) {
  const { createMonth, updateMonth } = useUser();
  const [dateMessage, setDateMessage] = useState('')
  const [values, setValues] = useState(["", "", "", "", "", ""]);
  const [budget, setBudget] = useState('')

  useEffect(() => {
    if (isUpdate && month) {
      const [monthPart, yearPart] = month.date.split('/');
      const newValues = [...monthPart.split(''), ...yearPart.split('')];
      setValues(newValues);
      setBudget(month.budget)
    }
  }, [isUpdate, month]);


  const KEYBOARDS = {
    backspace: 8,
    arrowLeft: 37,
    arrowRight: 39,
  };
  const handleChange = (index, value) => {
    const newValues = [...values];
    if (!isNaN(value)) {
      newValues[index] = value;

      setValues(newValues);
      if (value && index < 5) {
        document.querySelector(`#input-${index + 1}`).focus();
      }
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

      if (parseInt(values[0] + values[1]) > 12) {
        setDateMessage('Data Invalida');
        return
      }

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
    } else {
      const updatedMonth = await updateMonth(month.id, parseInt(budget));
      setSelected()
      setEditCompra()
      setMonth(updatedMonth);

    }
  }

  function handleBack() {
    setSelected()
    setEditCompra()
  }

  function handleChangeBudget(e) {
    const inputValue = e.target.value;

    if (!isNaN(inputValue)) {
      setBudget(inputValue);
    }
  }

  return (
    <div className=" w-full lg:w-3/5 h-4/5">
      {isUpdate &&
        <div className="w-full flex justify-end">
          <h1 onClick={() => handleBack()} className="cursor-pointer text-xl font-bold hover:scale-125 transition-all duration-300 ease-out">X</h1>
        </div>
      }
      <div className="flex flex-col items-center justify-evenly h-[100%] w-full">
        <div className="w-[23vw] h-[23vw] lg:w-[7.8vw] lg:h-[7.8vw] rounded-full flex items-center justify-center border border-tx">
          <Image src={calendario} className="w-[90%] h-[90%] rounded-full" alt="graph image" />
        </div>
        <h1 className="text-4xl font-semibold">{isUpdate ? 'Update Mes' : 'Novo Mes'}</h1>
        {dateMessage !== '' && <Error message={dateMessage} />}
          <div className="w-11/12 md:w-4/5 flex flex-row justify-center">
            {values.map((value, index) => (
              <>
                  <div key={index} className="flex flex-row justify-center input-group text-tx w-full">
                    <input
                      type="text"
                      id={`input-${index}`}
                      pattern="[0-9]"
                      className={`input text-tx border-2 w-full lg:w-[80%] h-[100%]  rounded-lg mr-2 font-bold ${isUpdate ? 'cursor-not-allowed' : ''}  ${value.length !== 0 ? 'inputFocus' : ''}`}
                      onChange={(e) => handleChange(index, e.target.value)}
                      style={{ color: 'white', padding:'10px' }}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      value={value}
                      disabled={isUpdate}
                      maxLength="1"
                    />
                    <label className={`user-label ${value.length !== 0 ? 'labelFocus' : ''} `}> {index <= 1 ? 'M' : 'Y'} </label>
                  </div>
                {index === 1 && <div className="h-full w-7 lg:w-14 mr-4 flex items-center justify-center text-center text-5xl">/</div>}
              </>
            ))}
          </div>
        <div className="w-11/12 md:w-4/5">
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

        <button
          onClick={() => handleClick()}
          className={`w-11/12 md:w-4/5 h-10 rounded-xl mt-4 ${values.some(value => value === "") || budget === "" ? 'bg-gray-500 cursor-not-allowed' : 'bg-Secundary hover:scale-110 transition-all ease-out duration-200'}`}
          disabled={values.some(value => value === "") || budget === ""}
        >
          {isUpdate ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </div>
  )
}
