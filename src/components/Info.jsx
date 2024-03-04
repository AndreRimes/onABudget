import Image from "next/image";
import gitHubIcon from '../../public/github.png'
import linkedInIcon from '../../public/linkedin.png'
import cvIcon from "../../public/cv.png"
import Link from "next/link"
import { Revel } from "./Revel";

export default function Info() {

    return (
        <div className="w-full h-full p-4">
            <div className="w-full py-5">
                <Revel>
                    <div className="flex flex-row w-full items-center justify-between py-5">
                        <h1 className="text-5xl text-[#9400D3] font-bold ">Sobre o Criador. </h1>
                        <div className="w-[70%] h-[1px] bg-gray-600 mt-4"></div>
                    </div>
                </Revel>
                <Revel>
                    <p className="text-xl font-semibold">
                        Meu nome e Andre Rimes e eu sou um estudante de ciencia da computacao da UIC
                        (University of illinois Chicago) e um entusiasta de engenharia de sowftware
                        <br />
                        <br />
                        Para mais informacoes:
                    </p>
                </Revel>

                <div className="flex flex-row justify-evenly py-4">
                    <Revel>
                        <div className="flex flex-row items-center">
                            <Image src={gitHubIcon} alt="github" width={30} height={30} />
                            <Link className="px-3" href="https://github.com/AndreRimes">AndreRimes</Link>
                        </div>
                    </Revel>

                    <Revel>
                        <div className="flex flex-row items-center">
                            <Image src={linkedInIcon} alt="linkedin" width={30} height={30} />
                            <Link className="px-3" href="https://www.linkedin.com/in/andrerimes/">AndreRimes</Link>
                        </div>
                    </Revel>


                    <Revel>
                        <div className="flex flex-row items-center">
                            <Image src={cvIcon} alt="Curriculo" width={30} height={30} />
                            <Link className="px-3" href="https://docs.google.com/document/d/1RfEsR9GgkJu6153xDl-gQVYrKXW1z27xBxEquQmDdoY/edit?usp=sharing">AndreRimes</Link>
                        </div>
                    </Revel>

                </div>
            </div>

            <div className="w-full py-5">
                <Revel>
                    <div className="flex flex-row w-full items-center justify-between py-5">
                        <h1 className="text-5xl text-[#9400D3] font-bold ">Sobre o Projeto. </h1>
                        <div className="w-[70%] h-[1px] bg-gray-600 mt-4"></div>
                    </div>
                </Revel>
                <Revel>
                    <p className="text-xl font-semibold">
                        O OnABudget é um projeto pessoal criado com o objetivo de me auxiliar no gerenciamento financeiro, especialmente no monitoramento de despesas, considerando um orçamento limitado.
                        <br />
                        <br />
                        Além disso, visa aprimorar minhas habilidades em desenvolvimento web em suas mais novas tecnologias.
                    </p>
                </Revel>
            </div>

            <div className="w-full py-5">
                <Revel>
                    <div className="flex flex-row w-full items-center justify-between py-5">
                        <h1 className="text-5xl text-[#9400D3] font-bold ">Features. </h1>
                        <div className="w-[80%] h-[1px] bg-gray-600 mt-4"></div>
                    </div>
                </Revel>
                <div className="text-xl font-semibold">
                    <Revel>
                        1) Estabelecer uma meta de gastos específica para cada mês.
                    </Revel>
                    <Revel>
                        2) Registrar as compras, atribuindo-as às categorias correspondentes.
                    </Revel>
                    <Revel>
                        3) Visualizar seus gastos e suas categorias de forma tabular.
                    </Revel>
                    <Revel>
                        4) Presentar graficamente os gastos mensais para uma melhor compreensão.
                    </Revel>
                </div>
            </div>

        </div >
    )
}