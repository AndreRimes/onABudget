'use client'
import { useState, useEffect } from 'react'
import useAuth from '@/Domain/hooks/useAuth'
import { useUser } from '@/Domain/userContext'
import Profile from '@/components/profile'
import Table from '@/components/table'
import Graph from '@/components/graph'
import Modal from '@/components/modal/modal'
import ModalProfile from '@/components/modal/modalProfile'
import ModalTutorial from '@/components/modal/modalTutorial'
import SideBar from '@/components/sideBar'
import { redirect } from 'next/navigation'
import { useLayoutEffect } from 'react'


export default function Home() {
  const { isLoged } = useAuth()
  const { user, currentMonth, spent } = useUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [isModalProfile, setIsModalProfile] = useState(false)
  const [isHamOpen, setIsHamOpen] = useState(false)

  useLayoutEffect(() => {
    if (!isLoged()) {
      redirect('/login')
    }
  }, [isLoged])


  return (
    <>
      {isHamOpen && <SideBar isHamOpen={isHamOpen} currentMonth={currentMonth} user={user} setIsModalProfile={setIsModalProfile}/>}
      <div className='flex flex-col justify-evenly w-screen h-screen'>
        {isModalOpen && <Modal setIsModalOpen={setIsModalOpen} month={month} setMonth={setMonth} />}
        {isModalProfile && <ModalProfile user={user} setIsModalProfile={setIsModalProfile} />}
        {user && user.tutorialComplete === false && <ModalTutorial setMonth={setMonth} />}

        <div className='w-full h-[65%] flex flex-row justify-evenly mt-4'>
          <Profile setIsHamOpen={setIsHamOpen} isHamOpen={isHamOpen} user={user} currentMonth={currentMonth} setIsModalProfile={setIsModalProfile} />
          <Table spent={spent} currentMonth={currentMonth} user={user} />
        </div>

        <div className='w-full h-[55%] flex felx-col items-center justify-center '>
          <Graph setMonth={setMonth} setIsModalOpen={setIsModalOpen} />
        </div>

      </div>
    </>
  )
}
