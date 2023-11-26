import Image from "next/image"
export default function Profile({user,currentMonth}) {
    return (
        <div className='w-2/5 h-[90%] flex flex-col justify-evenly bg-Primary  rounded-xl text-xl px-10'> 
            <Image alt='pp' src={user.imgUrl} width={100} height={100} className='rounded-full' />
            <h1>{user.username}</h1>
            <h1>Budget: {currentMonth?.budget}</h1>
            <h1>Gasto: {currentMonth?.spent}</h1>
            <h1>Sobrando: {currentMonth?.budget - currentMonth?.spent}</h1>
        </div>
    )
}