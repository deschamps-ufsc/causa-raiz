import React, { createContext, useContext, useState, useEffect } from 'react';

const UsinaContext = createContext();

export function UsinaProvider({ children }) {
  const [usinaAtual, setUsinaAtual] = useState(() => {
    return localStorage.getItem('@UsinaSolar:usinaAtual') || '';
  });

  const [campanhaAtual, setCampanhaAtual] = useState(() => {
    return localStorage.getItem('@UsinaSolar:campanhaAtual') || null;
  });

  useEffect(() => {
    if (usinaAtual) {
      localStorage.setItem('@UsinaSolar:usinaAtual', usinaAtual);
    } else {
      localStorage.removeItem('@UsinaSolar:usinaAtual');
    }
  }, [usinaAtual]);

  useEffect(() => {
    if (campanhaAtual) {
      localStorage.setItem('@UsinaSolar:campanhaAtual', campanhaAtual);
    } else {
      localStorage.removeItem('@UsinaSolar:campanhaAtual');
    }
  }, [campanhaAtual]);

  return (
    <UsinaContext.Provider value={{ usinaAtual, setUsinaAtual, campanhaAtual, setCampanhaAtual }}>
      {children}
    </UsinaContext.Provider>
  );
}

export function useUsina() {
  const context = useContext(UsinaContext);
  if (!context) {
    throw new Error('useUsina deve ser usado dentro de um UsinaProvider');
  }
  return context;
}
