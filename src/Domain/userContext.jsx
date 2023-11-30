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
          await Promise.all(result.months.map(async (id) => {
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
    }
    let sum = 0;
    const newSpent = {}
    currentMonth?.compras?.map((compra) => {
      sum += compra.price;
      newSpent[compra.categoria] = (newSpent[compra.categoria] || 0) + compra.price
    })
    if (currentMonth && sum !== currentMonth?.spent) {
      updateSpent(sum);
    }

    setSpent(newSpent)

  }, [currentMonth?.compras])

  async function addCompra(compra, month, i) {
    let updatedMonth;
  
    if (i !== -1) {
      const updatedCompras = [];

      month.compras.map((c,index)=>{
        if(index == i){
          updatedCompras.push(compra)
        }else{
          updatedCompras.push(c)
        }
      })

      updatedMonth = await pb.collection('month').update(month.id, {
        compras: JSON.stringify(updatedCompras),
        spent: month.spent - month.compras[i].price + compra.price,
      });
    } else {
      updatedMonth = await pb.collection('month').update(month.id, {
        compras: JSON.stringify([...month.compras, compra]),
        spent: compra.price + month.spent,
      });
    }
  
    const newMonths = months.map((m) => (m.id === month.id ? updatedMonth : m));
  
    if (month.id === currentMonth.id) {
      setCurrentMonth(updatedMonth);
    }
  
    setMonths(newMonths);
    console.log(updatedMonth);
    return updatedMonth;
  }
  

  async function createMonth(data) {
    try {
      const month = await pb.collection('month').create({ ...data, userId: pb.authStore.model?.id, });
      const User = await pb.collection('users').update(pb.authStore.model?.id, { months: [...user.months, month.id] });
      console.log(User);
      setMonths([...months, month])
      setUser(User)

      const currentDate = new Date();
      const currentM = currentDate.getMonth() + 1;
      const currentY = currentDate.getFullYear();

      const [m, year] = (month.date.split('/'))
      if (m === currentM.toString() && year === currentY.toString()) {
        setCurrentMonth(month);
      }
      return month
    } catch (e) {
      console.log(e)
    }

  }


  async function deleteCompra(index, month) {
    const newCompras = month.compras.filter((compra, i) => {
      return index !== i
    })
    const preco = month.compras[index].price
    try {
      const updatedMonth = await pb.collection('month').update(month.id, { compras: newCompras, spent: month.spent - preco });
      const newMonths = []
      months.map((m) => {
        if (m.id === month.id) {
          newMonths.push(updatedMonth)
        } else {
          newMonths.push(m)
        }
      })
      setMonths(newMonths)
      if (month.id === currentMonth.id) {
        setCurrentMonth(updatedMonth);
      }
      return updatedMonth
    } catch (e) {
      console.log(e)
    }
  }

  return (
    <UserContext.Provider value={{ user, months, currentMonth, spent, addCompra, createMonth, deleteCompra }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  return context;
};
