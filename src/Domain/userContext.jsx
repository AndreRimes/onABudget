'use client'
import pb from './pocketbase';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'



const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({});
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState()
  const [spent, setSpent] = useState()
  const [teste,setTeste] = useState(false)
  const router = useRouter()


  // Find the user and the currentMonth 
  useEffect(() => {
    console.log("RODOOOOO")
    async function getUser() {
      if (pb.authStore.isValid && pb.authStore.model?.id) {
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
          console.error("Error fetching user data", e);
        }
      }
    }
    getUser();
  },  [pb.authStore.isValid, pb.authStore.model?.id, teste]);

  


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
      const month = await pb.collection('month').create({ ...data, userId: user.id });
      console.log(user.id)
      console.log([...user.months, month.id])
      const User = await pb.collection('users').update(user.id, { months: [...user.months, month.id] });
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

  async function updateMonth(id,budget){
    try{
      const updatedMonth = await pb.collection('month').update(id,{budget:budget});

      const newMonths = months.filter((month)=>month.id !== id);
      newMonths.push(updatedMonth)

      setMonths(newMonths)

      if(currentMonth.id === id){
        setCurrentMonth(updatedMonth)
      }

      return updatedMonth
    }catch(e){
      console.log(e)
    }
  }

  async function deleteMonth(id){
    try{
      const deleteMonth = await pb.collection('month').delete(id);
      const newMonths = months.filter((month) => month.id !== id);
      // [x] set newMonths
      // [x] set user.months
      // [x] month -> ja setei no front
      setMonths(newMonths);
      setUser({...user, months:newMonths})

      console.log(user);

      if(id === currentMonth.id){
        setCurrentMonth({})
      }

      return deleteMonth;
    }catch(e){
      return e
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

  async function updateUsername(newUsername){
      try{
        const User = await pb.collection('users').update(user.id,{username:newUsername});
        setUser(User)
        console.log(User)
        return 'Username atualizado com sucesso'
      }catch(e){
        return 'Erro ao atualizar o username'
      }
  }


  async function updateEmail(newEmail){
    try{
    const res = await pb.collection('users').requestEmailChange(newEmail);
    pb.authStore.clear();
    router.push('/login')
    return res
    }catch(e){
      console.log(e)
      return e
    }
  }


  async function updatePassword(newPassword,confirmPassword){
    try{
      const res = await pb.collection('users').requestPasswordReset(user.email); 
      pb.authStore.clear();
      router.push('/login')
      return res
    }catch(e){
      return e
    }

  }


  return (
    <UserContext.Provider value={{ user, months, currentMonth, spent, addCompra, createMonth, deleteCompra,updateUsername,updateEmail,updatePassword,setTeste,deleteMonth,updateMonth}}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  return context;
};
