import { useState } from "react"

export default function Table({spent,currentMonth}) {
    const [hovered, setHovered] = useState()
    const colors = ['#BB86FC', "#03DAC5", "#CF6679"]

    function handleEnter(categorie) {
        setHovered(categorie)
    
      }
      function handleLeave(params) {
        setHovered("")
      }

    return (
        <div className='w-2/5  h-[90%] bg-Primary  rounded-xl text-xl px-10' >
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
            <table className='w-full'>
                <thead className="w-full">
                    <tr className='w-full flex flex-row justify-evenly'>
                        <th className='w-24 flex items-center justify-center'>{currentMonth?.date}</th>
                        <th className='w-24 flex items-center justify-center'>Gastro</th>
                        <th className='w-24 flex items-center justify-center'>Budget</th>
                        <th className='w-24 flex items-center justify-center'>Porcentagem</th>
                    </tr>
                </thead>
                <tbody className='w-full'>
                    {spent && Object.keys(spent).map((key, index) => (
                        <tr
                            onMouseEnter={() => handleEnter(key)}
                            onMouseLeave={() => handleLeave(key)}
                            key={index} className='w-full flex flex-row justify-evenly rounded-lg'
                            style={{ backgroundColor: `${hovered == key ? '#343536' : ''}` }} >
                            <td className='w-24 flex items-center justify-center'>{key}</td>
                            <td className='w-24 flex items-center justify-center'>{spent[key]}</td>
                            <td className='w-24 flex items-center justify-center'>-----</td>
                            <td className='w-24 flex items-center justify-center'>{(spent[key] * 100 / currentMonth?.budget).toFixed(2)}%</td>
                        </tr>
                    ))}
                    <tr className='w-full flex flex-row justify-evenly'>
                        <td className='w-24 flex items-center justify-center'>Total</td>
                        <td className='w-24 flex items-center justify-center'>{currentMonth?.spent}</td>
                        <td className='w-24 flex items-center justify-center'>{currentMonth?.budget}</td>
                        <td className='w-24 flex items-center justify-center'>{(currentMonth?.spent * 100 / currentMonth?.budget).toFixed(2) }%</td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}