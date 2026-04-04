import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsService } from '../services/transactions.service'
import type { ManualOrderRequest, OrderFilters } from '../types/transactions.types'
import toast from 'react-hot-toast'

export const TRANSACTIONS_QUERY_KEYS = {
  transactions: ['transactions'],
  transaction: (id: string) => ['transactions', id],
  balance: ['transactions', 'balance'],
  candles: (pair: string, period: string) => ['transactions', 'candles', pair, period],
  exchangeRate: (from: string, to: string) => ['transactions', 'exchange-rate', from, to],
  pairs: ['transactions', 'pairs'],
}

export function useTransactions(filters: OrderFilters) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEYS.transactions, filters],
    queryFn: () => transactionsService.getTransactions(filters),
    staleTime: 30000,
  })
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEYS.transaction(id),
    queryFn: () => transactionsService.getTransaction(id),
    enabled: !!id,
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (order: ManualOrderRequest) => transactionsService.createOrder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.transactions })
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.balance })
      toast.success('Ordem enviada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar ordem: ${error.message}`)
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderId: string) => transactionsService.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.transactions })
      toast.success('Ordem cancelada com sucesso')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cancelar ordem: ${error.message}`)
    },
  })
}

export function useBalance() {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEYS.balance,
    queryFn: () => transactionsService.getBalance(),
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

export function useCandles(pair: string, period: string, limit: number = 100) {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEYS.candles(pair, period),
    queryFn: () => transactionsService.getCandles(pair, period, limit),
    staleTime: 5000,
    refetchInterval: 5000,
    enabled: !!pair && !!period,
  })
}

export function useExchangeRate(from: string, to: string) {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEYS.exchangeRate(from, to),
    queryFn: () => transactionsService.getExchangeRate(from, to),
    staleTime: 60000,
    enabled: !!from && !!to,
  })
}

export function useAvailablePairs() {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEYS.pairs,
    queryFn: () => transactionsService.getAvailablePairs(),
    staleTime: 300000,
  })
}