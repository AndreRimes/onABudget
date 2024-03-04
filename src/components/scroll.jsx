import pocketbaseIcon from "../../public/pocketbase.jpg"
import reactIcon from "../../public/react.png"
import tailwindIcon from "../../public/Tailwind.png"
import Image from "next/image"
import Marquee from "react-fast-marquee"


export default function Scrool() {

    const imgs = [
        pocketbaseIcon,
        reactIcon,
        tailwindIcon,
        pocketbaseIcon,
    ]

    return (

        <div className="w-full h-[20vh] flex items-center">
            <Marquee>
                {imgs.map((url) => {
                    return (
                        <Image key={url} src={url} alt="img" className="mr-40" width={64} height={64} />
                    )
                })}
            </Marquee>
        </div>

    )
}
