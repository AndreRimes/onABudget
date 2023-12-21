'use client'
import { useEffect, useState } from 'react'
import useAuth from '@/Domain/hooks/useAuth'
import { useUser } from '@/Domain/userContext'
import Profile from '@/components/profile'
import Table from '@/components/table'
import Graph from '@/components/graph'
import Modal from '@/components/modal/modal'
import ModalProfile from '@/components/modal/modalProfile'
import Loading from '@/components/loading'

export default function Home() {
  const { isLoged, logout } = useAuth()
  const { user, currentMonth, spent } = useUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [isModalProfile, setIsModalProfile] = useState(false)

  useEffect(() => {
    isLoged();
    setMonth(currentMonth)
  }, [currentMonth]);

  if (Object.keys(user).length === 0) {
    return <Loading />;
  }

  return (
    <div className='flex flex-col justify-evenly w-screen h-screen'>
      {isModalOpen && <Modal setIsModalOpen={setIsModalOpen} month={month} setMonth={setMonth} />}
      {isModalProfile && <ModalProfile user={user} setIsModalProfile={setIsModalProfile} />}
      <div className='w-full h-1/2 flex flex-row justify-evenly mt-4'>
        <Profile user={user} currentMonth={currentMonth} setIsModalProfile={setIsModalProfile} />
        <Table spent={spent} currentMonth={currentMonth} />
      </div>

      <div className='w-full h-3/5 flex felx-col items-center justify-center '>
        <Graph setMonth={setMonth} setIsModalOpen={setIsModalOpen} />
      </div>

      {/* <button onClick={() => logout()}>LOGOUT</button> */}
    </div>

  )
}
