import React, { createContext, useContext, useState, useEffect } from 'react';

const UsinaContext = createContext();

export function UsinaProvider({ children }) {
  const [usinaAtual, setUsinaAtual] = useState(() => {
    // Tenta recuperar do localStorage ao carregar a página
    return localStorage.getItem('@UsinaSolar:usinaAtual') || '';
  });

  useEffect(() => {
    // Sempre que usinaAtual mudar, salva no localStorage
    if (usinaAtual) {
      localStorage.setItem('@UsinaSolar:usinaAtual', usinaAtual);
    } else {
      localStorage.removeItem('@UsinaSolar:usinaAtual');
    }
  }, [usinaAtual]);

  return (
    <UsinaContext.Provider value={{ usinaAtual, setUsinaAtual }}>
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
