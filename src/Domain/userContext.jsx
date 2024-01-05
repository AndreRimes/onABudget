'use client'
import pb from './pocketbase';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'
import gmail from '../email/GmailApi.js'



const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({});
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState()
  const [spent, setSpent] = useState()
  const [teste, setTeste] = useState(false)
  const router = useRouter()


  // Find the user and the currentMonth 
  useEffect(() => {
    async function getUser() {
      if (pb.authStore.isValid && pb.authStore.model?.id) {
        try {
          const result = await pb.collection('users').getOne(pb.authStore.model?.id, { expand: 'months' });
          const currentDate = new Date();
          const currentM = currentDate.getMonth() + 1;
          const currentY = currentDate.getFullYear();
          console.log(currentM);
          console.log(currentY)

          let cm = {}
          var newMonths = [];
          for (const id of result.months) {
            const m = await pb.collection('month').getOne(id);
            newMonths.push(m);
            const [month, year] = m.date.split('/');
            console.log(month);
            console.log(year);

            if (parseInt(month) === currentM && parseInt(year) === currentY) {
              setCurrentMonth(m);
              cm = m
            }
          }

          setUser(result);
          setMonths(newMonths);
          await processCompras(gmail, pb, newMonths, result.lastSearch, cm);

          await pb.collection('users').update(result.id, {lastSearch: new Date});
        } catch (e) {
          console.error("Error fetching user data: ", e);
        }
      }
    }

    getUser();
  }, [pb.authStore.isValid, pb.authStore.model?.id, teste]);


  async function processCompras(gmail, pb, newMonths, searchQuery,cm) {
    const compras = await gmail.readInboxContent("from:pncalerts@visa.com", searchQuery);
  
    for (const compra of compras) {
      const [dia, mes, ano] = compra.date.split('/');
      const key = `${mes}/${ano}`;
      const matchingMonth = newMonths.find((month) => month.date === key);
  
      if (matchingMonth) {
        const comprasArray = JSON.stringify([...matchingMonth.compras, compra]);
        try {
          const updatedMonth = await pb.collection('month').update(
            matchingMonth.id,
            { compras: comprasArray, spent: matchingMonth.spent + compra.price },
            { requestKey: null }
          );
            
          if(updatedMonth.id === cm.id){
            setCurrentMonth(updatedMonth)
          }
          
          newMonths = newMonths.filter((month) => month.id !== updatedMonth.id);
          newMonths.push(updatedMonth);
        } catch (e) {
          console.error(e);
        }
      }
    }
    setMonths(newMonths);
  }



  useEffect(() => {
    console.log(currentMonth);
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

      month.compras.map((c, index) => {
        if (index == i) {
          updatedCompras.push(compra)
        } else {
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
    return updatedMonth;
  }


  async function createMonth(data) {
    try {
      const month = await pb.collection('month').create({ ...data, userId: user.id });
      const User = await pb.collection('users').update(user.id, { months: [...user.months, month.id] });
      setMonths([...months, month])
      setUser(User)

      const currentDate = new Date();
      const currentM = currentDate.getMonth() + 1;
      const currentY = currentDate.getFullYear();

      const [m, year] = (month.date.split('/'))
      if (parseInt(m) === currentM && parseInt(year) === currentY) {
        setCurrentMonth(month);
      }
      return month
    } catch (e) {
      console.log(e)
    }
  }

  async function updateMonth(id, budget) {
    try {
      const updatedMonth = await pb.collection('month').update(id, { budget: budget });

      const newMonths = months.filter((month) => month.id !== id);
      newMonths.push(updatedMonth)

      setMonths(newMonths)

      if (currentMonth.id === id) {
        setCurrentMonth(updatedMonth)
      }

      return updatedMonth
    } catch (e) {
      console.log(e)
    }
  }

  async function deleteMonth(id) {
    try {
      const deleteMonth = await pb.collection('month').delete(id);
      const newMonths = months.filter((month) => month.id !== id);
      // [x] set newMonths
      // [x] set user.months
      // [x] month -> ja setei no front
      setMonths(newMonths);
      setUser({ ...user, months: newMonths })

      

      if (id === currentMonth.id) {
        setCurrentMonth({})
      }

      return deleteMonth;
    } catch (e) {
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

  async function updateUsername(newUsername) {
    try {
      const User = await pb.collection('users').update(user.id, { username: newUsername });
      setUser(User)
      console.log(User)
      return 'Username atualizado com sucesso'
    } catch (e) {
      return 'Erro ao atualizar o username'
    }
  }


  async function updateEmail(newEmail) {
    try {
      const res = await pb.collection('users').requestEmailChange(newEmail);
      pb.authStore.clear();
      router.push('/login')
      return res
    } catch (e) {
      console.log(e)
      return e
    }
  }


  async function updatePassword(newPassword, confirmPassword) {
    try {
      const res = await pb.collection('users').requestPasswordReset(user.email);
      pb.authStore.clear();
      router.push('/login')
      return res
    } catch (e) {
      return e
    }

  }


  return (
    <UserContext.Provider value={{ user, months, currentMonth, spent, addCompra, createMonth, deleteCompra, updateUsername, updateEmail, updatePassword, setTeste, deleteMonth, updateMonth }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  return context;
};
