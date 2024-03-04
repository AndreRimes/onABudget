import screenShotImg from "../../public/Screenshot.png"
import Image from "next/image"
export default function Cards() {

    return (

        <div className="w-1/2 h-full md:flex items-center hidden ">
            <div className="absolute translate-x-10 translate-y-10 bg-Primary p-3 rounded-lg hover:z-50
                        hover:scale-[103%] transition-all duration-200 ease-out ">
                <Image src={screenShotImg} alt="dashboard image" width={500} height={500} />
            </div>

            <div className="absolute translate-x-5 translate-y-5 bg-Primary p-3 rounded-lg hover:z-50 
                         hover:scale-[103%] transition-all duration-200 ease-out ">
                <Image src={screenShotImg} alt="dashboard image" width={500} height={500} />
            </div>

            <div className="absolute bg-Primary p-3 rounded-lg hover:z-50
                         hover:scale-[103%] transition-all duration-200 ease-out  ">
                <Image src={screenShotImg} alt="dashboard image" width={500} height={500} />
            </div>
        </div>
    )
}