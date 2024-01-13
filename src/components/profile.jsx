import Image from "next/image"
import threeDots from '../../public/3Dots.png'


export default function Profile({ user, currentMonth, setIsModalProfile }) {
    return (
        <div className='w-2/5 h-full flex flex-col items-center justify-evenly bg-Primary rounded-xl text-xl px-10'>
            <div className="w-full flex items-end justify-end">
                <Image onClick={() => setIsModalProfile(true)} className="cursor-pointer hover:scale-125 transition-all duration-300 ease-in " src={threeDots} width={24} height={24} />
            </div>
            <div className="w-full h-4/5 flex flex-row justify-evenly  ">
                <div className="h-2/3 flex items-center">
                    <div className="profile w-32 h-32 " style={{ borderRadius: '127px', background: 'linear-gradient(145deg, #202122, #272829)', boxShadow: '24px 24px 51px #1e1e1f,-24px -24px 51px #2a2c2d' }}></div>
                </div>
                <div className="w-2/3 h-full flex flex-col justify-evenly" >
                    {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1>{user.username}</h1>}
                    {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1>Budget: {currentMonth ? currentMonth?.budget : "Mes atual nao existe"}</h1>}
                    {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1>Gasto: {currentMonth ? (currentMonth?.spent)?.toFixed(2) : "Mes atual nao existe"}</h1>}
                    {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1>Sobrando: {currentMonth ? (currentMonth?.budget - currentMonth?.spent).toFixed(2) : "Mes atual nao existe"}</h1>}

                    {Object.keys(user).length === 0 ? <div className="w-full h-6 bg-Dark rounded-md animate-pulse"></div> :
                        <div className="w-full h-6 bg-tx transition-all duration-300 ease-in overflow-hidden ">
                            <div className={`${currentMonth && currentMonth?.spent * 100 / currentMonth?.budget >= 100 ? 'bg-Error' : 'bg-Success'} h-6 transition-all duration-300 ease-in  `} style={{ width: `${currentMonth ? currentMonth?.spent * 100 / currentMonth?.budget : '0'}%` }}></div>
                        </div>
                    }
                </div>
            </div>
        </div>
    )
}