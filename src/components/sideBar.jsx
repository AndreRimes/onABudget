export default function SideBar({ isHamOpen, user, currentMonth, setIsModalProfile }) {

    function handleClick() {
        setIsModalProfile(true)
    }

    return (
        <div className={`h-screen ${isHamOpen ? 'animate-sideBarOpen' : 'animate-sideBarClose'} w-2/3 z-10 md:w-1/3 absolute flex items-center justify-center lg:hidden bg-Primary rounded-tr-lg rounded-br-lg`}>
            <div className="w-11/12 h-1/2 flex flex-col items-center justify-evenly" >
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 onClick={handleClick} className="text-xl font-semibold hover:underline cursor-pointer">Name: {user.username}</h1>}
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 onClick={handleClick} className="text-xl font-semibold hover:underline cursor-pointer">Budget: {currentMonth ? currentMonth?.budget : "Mes atual nao existe"}</h1>}
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 onClick={handleClick} className="text-xl font-semibold hover:underline cursor-pointer" >Gasto: {currentMonth ? (currentMonth?.spent)?.toFixed(2) : "Mes atual nao existe"}</h1>}
                {Object.keys(user).length === 0 ? <div className="w-1/3 h-6 bg-Dark rounded-md animate-pulse"></div> : <h1 onClick={handleClick} className="text-xl font-semibold hover:underline cursor-pointer">Sobrando: {currentMonth ? (currentMonth?.budget - currentMonth?.spent).toFixed(2) : "Mes atual nao existe"}</h1>}

                {Object.keys(user).length === 0 ? <div className="w-full h-6 bg-Dark rounded-md animate-pulse"></div> :
                    <div className="w-full h-6 bg-tx transition-all duration-300 ease-in overflow-hidden ">
                        <div className={`${currentMonth && currentMonth?.spent * 100 / currentMonth?.budget >= 100 ? 'bg-Error' : 'bg-Success'} h-6 transition-all duration-300 ease-in  `} style={{ width: `${currentMonth ? currentMonth?.spent * 100 / currentMonth?.budget : '0'}%` }}></div>
                    </div>
                }
            </div>
        </div>
    )
}