import { useState } from "react"
import StyledContainer from "./scrollBar"

export default function Table({ spent, currentMonth }) {
    const [hovered, setHovered] = useState()
    const colors = ['#BB86FC', "#03DAC5", "#CF6679",'#610C9F','#DA0C81','#005B41']

    function handleEnter(categorie) {
        setHovered(categorie)

    }
    function handleLeave(params) {
        setHovered("")
    }

    return (
        <div className='w-2/5  h-full bg-Primary  rounded-xl text-xl px-10' >
            <div className='w-full h-1/3 flex flex-row items-center justify-center'>
                {spent && Object.keys(spent).map((key, index) => (
                    <div
                        key={index}
                        onMouseEnter={() => handleEnter(key)}
                        onMouseLeave={() => handleLeave(key)}
                        className='h-7 px-3 text-Dark'
                        style={{
                            width: `${(spent[key] * 100 / currentMonth?.budget) * 100}%`,
                            backgroundColor: colors[index % colors.length],
                        }}
                    >{hovered === key ? `${(spent[key] * 100 / currentMonth?.budget).toFixed(2)}%` : ''}</div>
                ))}
            </div>
            {/* TABLE */}
            <div className='w-full'>
                {/* Header */}
                <div className="w-full">
                    <div className='w-full flex flex-row justify-evenly'>
                        <h1 className='w-24 flex items-center justify-center'>{currentMonth?.date}</h1>
                        <h1 className='w-24 flex items-center justify-center'>Gastro</h1>
                        <h1 className='w-24 flex items-center justify-center'>Budget</h1>
                        <h1 className='w-24 flex items-center justify-center'>Porcentagem</h1>
                    </div>
                </div>
                {/* BODY */}
                <StyledContainer>
                <div className='w-full max-h-[120px] overflow-y-auto'> 
                    {spent && Object.keys(spent).map((key, index) => (
                        <div
                            onMouseEnter={() => handleEnter(key)}
                            onMouseLeave={() => handleLeave(key)}
                            key={index} className='w-full h-1/6 flex flex-row justify-evenly rounded-lg'
                            style={{ backgroundColor: `${hovered == key ? '#343536' : ''}` }} >
                            <h2 className='w-24 flex items-center justify-center'>{key}</h2>
                            <h2 className='w-24 flex items-center justify-center'>{spent[key]}</h2>
                            <h2 className='w-24 flex items-center justify-center'>-----</h2>
                            <h2 className='w-24 flex items-center justify-center'>{(spent[key] * 100 / currentMonth?.budget).toFixed(2)}%</h2>
                        </div>
                    ))}
                </div>
                </StyledContainer>
                {/* FOOTER */}
                <div>
                    <div className='w-full flex flex-row justify-evenly'>
                        <h2 className='w-24 flex items-center justify-center'>Total</h2>
                        <h2 className='w-24 flex items-center justify-center'>{currentMonth?.spent}</h2>
                        <h2 className='w-24 flex items-center justify-center'>{currentMonth?.budget}</h2>
                        <h2 className='w-24 flex items-center justify-center'>{(currentMonth?.spent * 100 / currentMonth?.budget).toFixed(2)}%</h2>
                    </div>
                </div>
            </div>
        </div>
    )
}