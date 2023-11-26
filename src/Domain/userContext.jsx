'use client'
import pb from './pocketbase';
import React, { createContext, useContext, useState, useEffect } from 'react';



const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({});
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState()
  const [spent, setSpent] = useState()

  // Find the user and the currentMonth 
  useEffect(() => {
    async function getUser() {
      if (pb.authStore.isValid) {
        try {
          const result = await pb.collection('users').getOne(pb.authStore.model?.id, { expand: 'months' });

          const currentDate = new Date();
          const currentM = currentDate.getMonth() + 1;
          const currentY = currentDate.getFullYear();

          const newMonths = [];
          await Promise.all(result.mouths.map(async (id) => {
            const m = await pb.collection('month').getOne(id);
            newMonths.push(m);
            const [mouth, year] = (m.date.split('/'))
            if (mouth === currentM.toString() && year === currentY.toString()) {
              setCurrentMonth(m);
            }
          }));

          setMonths(newMonths);
          setUser(result);
        } catch (e) {
          console.error("Error fetching user data:", e);
        }
      }
    }
    getUser();
  }, [pb.authStore]);


  useEffect(() => {
    async function updateSpent(sum) {
      const res = await pb.collection('month').update(currentMonth.id, { spent: sum })
      console.log(res);
    }
    let sum = 0;
    const newSpent = {}
    currentMonth?.compras.map((compra) => {
      sum += compra.price;
      newSpent[compra.categoria] = (newSpent[compra.categoria] || 0) + compra.price
    })
    if (currentMonth && sum !== currentMonth?.spent) {
      updateSpent(sum);
    }

    setSpent(newSpent)

  }, [currentMonth?.compras,months])

 async function addCompra(compra,month){
    const updatedMonth = await pb.collection('month').update(month.id,{compras: JSON.stringify([...month.compras,compra]), spent: compra.price + month.spent  })

    const newMonths = []
    months.map((m)=>{
      if(m.id === month.id){
        newMonths.push(updatedMonth)
      }else{
        newMonths.push(m)
      }
    })

    if(month.id === currentMonth.id){
      setCurrentMonth(updatedMonth)
    }

    setMonths(newMonths)
  }


  return (
    <UserContext.Provider value={{ user, months, currentMonth,spent,addCompra}}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  return context;
};
