'use client'
import { useEffect, useState } from 'react'
import useAuth from '@/Domain/hooks/useAuth'
import { useUser } from '@/Domain/userContext'
import Profile from '@/components/profile'
import Table from '@/components/table'
import Graph from '@/components/graph'
import Modal from '@/components/modal/modal'

export default function Home() {
  const { isLoged, logout } = useAuth()
  const { user, currentMonth, spent } = useUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);

  useEffect(() => {
    isLoged();
    setMonth(currentMonth)
  }, [currentMonth]);

  return (
    <div className='flex flex-col justify-evenly w-screen h-screen'>
      {isModalOpen && <Modal setIsModalOpen={setIsModalOpen} month={month} setMonth={setMonth} />}
      <div className='w-full h-1/2 flex flex-row justify-evenly mt-4'>
        <Profile user={user} currentMonth={currentMonth} />
        <Table spent={spent} currentMonth={currentMonth} />
      </div>

      <div className='w-full h-3/5 flex felx-col items-center justify-center '>
        <Graph setMonth={setMonth} setIsModalOpen={setIsModalOpen} />
      </div>

      <button onClick={() => setIsModalOpen(true)}>Open Modal</button>
    </div>
  )
}
