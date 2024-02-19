import { useState, useEffect } from "react"
import StyledContainer from "./scrollBar"

export default function Table({ spent, currentMonth }) {
    const [hovered, setHovered] = useState()
    const colors = ['#BB86FC', "#03DAC5", "#CF6679", '#610C9F', '#DA0C81', '#005B41']

    function handleEnter(categorie) {
        setHovered(categorie)

    }

    function handleLeave() {
        setHovered(null);
    }

    return (
        <div className='w-11/12 lg:w-2/5 h-full bg-Primary rounded-xl text-xl px-3 md:py-2 lg:px-10 border-[2px]'>
            <div className='w-full h-1/5 lg:h-[20%] flex flex-row items-center justify-center'>
                {!currentMonth ? (
                    <div className="w-full bg-Dark rounded-md animate-pulse h-1/3 "></div>
                ) : (
                    spent && Object.keys(spent).map((key, index) => (
                        <div
                            key={index}
                            onMouseEnter={() => handleEnter(key)}
                            onMouseLeave={() => handleLeave()}
                            className='h-7 lg:6 px-3 text-Dark'
                            style={{
                                width: `${(spent[key] * 100 / currentMonth?.budget) * 100}%`,
                                backgroundColor: colors[index % colors.length],
                            }}>
                            {hovered === key ? `${(spent[key] * 100 / currentMonth?.budget).toFixed(2)}%` : ''}
                        </div>
                    ))
                )}
            </div>
            {/* TABLE */}
            <div className='w-full'>
                {/* Header */}
                <div className="w-full">
                    <div className='w-full flex flex-row justify-evenly'>
                        {!currentMonth ? <div className="w-24 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 className='w-24 flex items-center justify-center'>{currentMonth?.date}</h1>}
                        {!currentMonth ? <div className="w-24 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 className='w-24 flex items-center justify-center'>Gastro</h1>}
                        {!currentMonth ? <div className="w-24 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 className='w-24 flex items-center justify-center ml-3'>Porcentagem</h1>}
                    </div>
                </div>
                {/* BODY */}
                <StyledContainer>
                    <div className={`tableHeight w-full lg:max-h-[12vh] overflow-y-auto mb-1  ${!currentMonth ? 'mt-2' : ''}`}>
                        {spent ? Object.keys(spent).map((key, index) => (
                            <div
                                onMouseEnter={() => handleEnter(key)}
                                onMouseLeave={() => handleLeave()}
                                key={index} className='w-full h-1/6 flex flex-row justify-evenly rounded-lg'
                                style={{ backgroundColor: `${hovered === key ? '#343536' : ''}` }} >
                                <h2 className='w-24 flex items-center justify-center'>{!key ? 'Desconhecido' : key}</h2>
                                <h2 className='w-24 flex items-center justify-center'>{(spent[key]).toFixed(2)}</h2>
                                {/* <h2 className='w-24 flex items-center justify-center'>-----</h2> */}
                                <h2 className='w-24 flex items-center justify-center'>{(spent[key] * 100 / currentMonth?.budget).toFixed(2)}%</h2>
                            </div>
                        )) : (
                            <div className="flex flex-row w-full justify-evenly">
                                <div className='w-24 h-6 rounded-md bg-Dark animate-pulse flex items-center justify-center'></div>
                                <div className='w-24 h-6 rounded-md bg-Dark animate-pulse flex items-center justify-center'></div>
                                {/* <div className='w-24 h-6 rounded-md bg-Dark animate-pulse flex items-center justify-center'></div> */}
                                <div className='w-24 h-6 rounded-md bg-Dark animate-pulse flex items-center justify-center'></div>
                            </div>
                        )}
                    </div>
                </StyledContainer>
                <div className="w-full h-[1px] mt-1 mb-1 bg-white"></div>

                {/* FOOTER */}
                
                <div>
                    <div className={`w-full flex flex-row justify-evenly  ${!currentMonth ? 'mt-2' : ''} `}>
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>Total</h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>{(currentMonth?.spent).toFixed(2)}</h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>{(currentMonth?.spent * 100 / currentMonth?.budget).toFixed(2)}%</h2>}

                    </div>
                </div>
                <div>
                    <div className={`w-full flex flex-row justify-evenly  ${!currentMonth ? 'mt-2' : ''} `}>
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>Budget: </h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>{(currentMonth?.budget).toFixed(2)}</h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>-------</h2>}
                    </div>
                </div>
                <div>
                    <div className={`w-full flex flex-row justify-evenly  ${!currentMonth ? 'mt-2' : ''} `}>
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>Sobrando: </h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>{((currentMonth?.budget) - (currentMonth?.spent)).toFixed(2)}</h2>}
                        {!currentMonth ? <div className="w-[35%] h-6 bg-Dark rounded-md animate-pulse"></div> : <h2 className='w-24 flex items-center justify-center'>-------</h2>}
                    </div>
                </div>


            </div>
        </div>
    )
}