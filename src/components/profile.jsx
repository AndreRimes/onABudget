import Image from "next/image"
export default function Profile({user,currentMonth}) {
    return (
        <div className='w-2/5 h-[90%] flex flex-col justify-evenly bg-Primary  rounded-xl text-xl px-10'> 
            <h1>{user.username}</h1>
            <h1>Budget: {currentMonth?.budget}</h1>
            <h1>Gasto: {currentMonth?.spent}</h1>
            <h1>Sobrando: {currentMonth?.budget - currentMonth?.spent}</h1>
            <div className="w-[90%] h-6 bg-tx transition-all duration-300 ease-in ">
                <div className={`bg-Secundary h-6 transition-all duration-300 ease-in  `} style={{width: `${currentMonth?.spent  * 100 / currentMonth?.budget}%` }}></div>
            </div>
        </div>
    )
}