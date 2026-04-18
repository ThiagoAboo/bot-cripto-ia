import { useState, useEffect } from 'react'
import { useConfigurations, useSaveConfigurations, useTestConnection } from './hooks/useConfigurations'
import { ApiKeysCard } from './components/ApiKeysCard'
import { RiskManagementCard } from './components/RiskManagementCard'
import { AllowedPairsCard } from './components/AllowedPairsCard'
import { FeesCard } from './components/FeesCard'
import { PairDiscoveryCard } from './components/PairDiscoveryCard'
import { AdvancedOptionsCard } from './components/AdvancedOptionsCard'
import { StrategiesConfigCard } from './components/StrategiesConfigCard'
import { BackupOperationsCard } from './components/BackupOperationsCard'
import { ResetOperationsCard } from './components/ResetOperationsCard'
import { Button } from '../../shared/components/ui/Button'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { Save, RotateCcw, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Configurations } from './types/configurations.types'

export default function ConfiguracoesPage() {
  const { data: config, isLoading, refetch } = useConfigurations()
  const { mutate: saveConfig, isPending: isSaving } = useSaveConfigurations()
  const { mutate: testConnection, isPending: isTesting } = useTestConnection()
  
  const [localConfig, setLocalConfig] = useState<Configurations | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Sincronizar dados do back-end com o estado local
  useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)))
      setHasChanges(false)
    }
  }, [config])

  const handleChange = <K extends keyof Configurations>(
    section: K,
    value: Configurations[K]
  ) => {
    if (localConfig) {
      setLocalConfig({ ...localConfig, [section]: value })
      setHasChanges(true)
    }
  }

  const handleSave = () => {
    if (localConfig) {
      saveConfig(localConfig, {
        onSuccess: () => {
          setHasChanges(false)
          refetch()
        },
      })
    }
  }

  const handleReset = () => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)))
      setHasChanges(false)
      toast.success('Alterações descartadas')
    }
  }

  const handleTestConnection = () => {
    if (localConfig) {
      testConnection(localConfig.exchangeApiKeys)
    }
  }

  if (isLoading || !localConfig) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Configurações</h1>
            <p className="text-gray-400 mt-1">Configure as APIs, parâmetros e estratégias dos bots</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-10 bg-dark-100 py-4 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-gray-400 mt-1">Configure as APIs, parâmetros e estratégias dos bots</p>
        </div>
        
        <div className="flex gap-3">
          {hasChanges && (
            <Button variant="secondary" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Descartar
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Grid de Configurações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1 */}
        <div className="space-y-6">
          <ApiKeysCard
            data={localConfig.exchangeApiKeys}
            onChange={(value) => handleChange('exchangeApiKeys', value)}
            onTestConnection={handleTestConnection}
            isTesting={isTesting}
          />
          
          <RiskManagementCard
            data={localConfig.botParameters.riskManagement}
            onChange={(value) =>
              handleChange('botParameters', {
                ...localConfig.botParameters,
                riskManagement: value,
              })
            }
          />
          
          <FeesCard
            data={localConfig.botParameters.fees}
            onChange={(value) =>
              handleChange('botParameters', {
                ...localConfig.botParameters,
                fees: value,
              })
            }
          />
        </div>

        {/* Coluna 2 */}
        <div className="space-y-6">
          <AllowedPairsCard
            data={localConfig.botParameters.allowedPairs}
            onChange={(value) =>
              handleChange('botParameters', {
                ...localConfig.botParameters,
                allowedPairs: value,
              })
            }
          />

          <PairDiscoveryCard
            data={localConfig.botParameters.pairDiscovery}
            allowedPairs={localConfig.botParameters.allowedPairs}
            fees={localConfig.botParameters.fees}
            onChange={(value) =>
              handleChange('botParameters', {
                ...localConfig.botParameters,
                pairDiscovery: value,
              })
            }
            onApplyResult={({ allowedPairs, pairDiscovery }) => {
              setLocalConfig((current) => {
                if (!current) {
                  return current
                }

                return {
                  ...current,
                  botParameters: {
                    ...current.botParameters,
                    allowedPairs,
                    pairDiscovery,
                  },
                }
              })
            }}
            onRunResult={({ allowedPairs, pairDiscovery }) => {
              setLocalConfig((current) => {
                if (!current) {
                  return current
                }

                return {
                  ...current,
                  botParameters: {
                    ...current.botParameters,
                    allowedPairs,
                    pairDiscovery,
                  },
                }
              })
            }}
          />
          
          <AdvancedOptionsCard
            data={localConfig.botParameters.advanced}
            onChange={(value) =>
              handleChange('botParameters', {
                ...localConfig.botParameters,
                advanced: value,
              })
            }
          />
        </div>
      </div>

      {/* Configurações por Estratégia - Largura total */}
      <div className="mt-6">
        <StrategiesConfigCard
          data={localConfig.botParameters.strategies}
          onChange={(value) =>
            handleChange('botParameters', {
              ...localConfig.botParameters,
              strategies: value,
            })
          }
        />
      </div>

      <div className="mt-6">
        <BackupOperationsCard
          onRestoreCompleted={(result) => {
            setLocalConfig(JSON.parse(JSON.stringify(result.configuration)))
            setHasChanges(false)
            refetch()
          }}
        />
      </div>

      <div className="mt-6">
        <ResetOperationsCard
          onResetCompleted={(result) => {
            setLocalConfig(JSON.parse(JSON.stringify(result.configuration)))
            setHasChanges(false)
            refetch()
          }}
        />
      </div>

      {/* Status de salvamento */}
      {!hasChanges && config && (
        <div className="flex items-center justify-center gap-2 text-sm text-success">
          <CheckCircle className="w-4 h-4" />
          Todas as configurações estão salvas
        </div>
      )}
    </div>
  )
}
