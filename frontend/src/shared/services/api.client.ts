import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'

// Configuração base da API
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export interface ApiDataResponse<T> {
  success: boolean
  data: T
  message?: string
  error?: string
}

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Interceptor de requisição
    this.client.interceptors.request.use(
      (config) => {
        // Adicionar token de autenticação se existir
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Interceptor de resposta
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response.data
      },
      (error) => {
        if (error.response) {
          // Erro do servidor
          const message = error.response.data?.error || 'Erro na requisição'
          
          // Não mostrar toast para erros 404 em polling
          if (error.response.status !== 404) {
            toast.error(message)
          }
          
          console.error('API Error:', {
            status: error.response.status,
            message,
            url: error.config?.url,
          })
        } else if (error.request) {
          // Erro de rede
          console.error('Network Error:', error.message)
          toast.error('Erro de conexão com o servidor')
        } else {
          // Outros erros
          console.error('Request Error:', error.message)
        }
        
        return Promise.reject(error)
      }
    )
  }

  // Métodos HTTP
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.client.get(url, config)
  }

  async getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.get<ApiDataResponse<T>>(url, config)
    return this.extractData(response, url)
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.client.post(url, data, config)
  }

  async postData<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.post<ApiDataResponse<T>>(url, data, config)
    return this.extractData(response, url)
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.client.put(url, data, config)
  }

  async putData<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.put<ApiDataResponse<T>>(url, data, config)
    return this.extractData(response, url)
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.client.patch(url, data, config)
  }

  async patchData<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.patch<ApiDataResponse<T>>(url, data, config)
    return this.extractData(response, url)
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.client.delete(url, config)
  }

  async deleteData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.delete<ApiDataResponse<T>>(url, config)
    return this.extractData(response, url)
  }

  private extractData<T>(response: ApiDataResponse<T>, url: string): T {
    if (!response || typeof response !== 'object' || !('data' in response)) {
      throw new Error(`Resposta inesperada da API em ${url}`)
    }

    return response.data
  }
}

export const apiClient = new ApiClient()
