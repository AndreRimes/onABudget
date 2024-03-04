"use client"
import Hero from "@/components/Hero"
import Cards from "@/components/Cards"
import Scrool from "@/components/scroll"
import Info from "@/components/Info"

import Image from "next/image"
import gitHubIcon from '../../public/github.png'
import linkedInIcon from '../../public/linkedin.png'
import cvIcon from "../../public/cv.png"
import Link from "next/link"

export default function main() {

    return (
        <>
            <div className="w-full h-20 flex items-center justify-center">
                <h1 className="font-bold text-3xl"> On A Budget</h1>
            </div>
            <div className="w-full flex flex-col px-5">
                <div className="w-full h-[70vh] flex flex-row px-4">
                    <Hero />
                    <Cards />
                </div>
                {/* <Revel> */}
                <Scrool />
                {/* </Revel> */}
                <div className="w-full flex flex-row px-4">
                    <Info />
                </div>
            </div>

        </>
    )
}

