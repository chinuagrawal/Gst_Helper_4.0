import { createContext, useContext } from 'react';
export const Account = createContext(null);
export const useAccount = () => useContext(Account);
