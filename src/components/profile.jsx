import Image from "next/image"
import threeDots from '../../public/3Dots.png'


export default function Profile({ user, currentMonth, setIsModalProfile }) {
    return (
        <div className='w-2/5 h-full flex flex-col justify-evenly bg-Primary  rounded-xl text-xl px-10'>
            <div className="w-full flex items-end justify-end">
                <Image onClick={() => setIsModalProfile(true)} className="cursor-pointer hover:scale-125 transition-all duration-300 ease-in " src={threeDots} width={24} height={24} />
            </div>
            <div className="profile w-32 h-32 " style={{borderRadius: '127px', background: 'linear-gradient(145deg, #202122, #272829)', boxShadow: '24px 24px 51px #1e1e1f,-24px -24px 51px #2a2c2d'}}>
                
            </div>
            <h1>{user.username}</h1>
            <h1>Budget: {currentMonth?.budget}</h1>
            <h1>Gasto: {currentMonth?.spent}</h1>
            <h1>Sobrando: {currentMonth?.budget - currentMonth?.spent}</h1>
            <div className="w-full h-6 bg-tx transition-all duration-300 ease-in ">
                <div className={`bg-Secundary h-6 transition-all duration-300 ease-in  `} style={{ width: `${currentMonth?.spent * 100 / currentMonth?.budget}%` }}></div>
            </div>
        </div>
    )
}