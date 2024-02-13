import Image from "next/image"
import threeDots from '../../public/3Dots.png'
import menu from "../../public/menu.png"


export default function Profile({ user, currentMonth, setIsModalProfile, isHamOpen, setIsHamOpen }) {

    const percentageSpent = (currentMonth?.spent / currentMonth?.budget) * 100 || 0;
    return (
        <>
            <div className={`w-2/5 h-full hidden lg:flex flex-col justify-evenly bg-Primary rounded-xl px-10 py-10 border-[3px]`}>
                <div className="absolute translate-x-[32vw] -translate-y-[15vh]">
                    <Image onClick={() => setIsModalProfile(true)} className="cursor-pointer hover:scale-125 transition-all duration-300 ease-in " src={threeDots} width={20} height={20} />
                </div>
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-12 bg-Dark rounded-md animate-pulse"></div> : <h1 className="text-3xl font-bold">Gasto: {(currentMonth?.spent).toFixed(2)}</h1>}
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-12 bg-Dark rounded-md animate-pulse"></div> : <h1 className="text-2xl font-bold">Budget: {currentMonth ? (currentMonth?.budget).toFixed(2) : "Mes atual nao existe"}</h1>}
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-12 bg-Dark rounded-md animate-pulse"></div> : <h1 className="text-xl font-bold">Sobrando: {currentMonth ? (currentMonth?.budget - currentMonth?.spent).toFixed(2) : "Mes atual nao existe"}</h1>}

            </div>

            <Image onClick={() => setIsHamOpen(!isHamOpen)} src={menu} width={24} height={24} className="lg:hidden absolute z-20 -translate-x-[45vw] cursor-pointer" atl="menu icon" />
        </>
    )
}