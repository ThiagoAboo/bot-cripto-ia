import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Label } from '../../../shared/components/ui/Label'
import { Input } from '../../../shared/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Switch } from '../../../shared/components/ui/Switch'
import { Sliders, TrendingUp, Activity, Brain } from 'lucide-react'

interface HyperparametersFormProps {
  hyperparameters: {
    hiddenLayers: number
    neuronsPerLayer: number[]
    dropoutRate: number
    activation: 'relu' | 'tanh' | 'sigmoid'
    batchSize: number
    epochs: number
    learningRate: number
    optimizer: 'adam' | 'sgd' | 'rmsprop'
    lossFunction: 'mse' | 'mae' | 'huber'
    validationSplit: number
    earlyStopping: {
      enabled: boolean
      patience: number
    }
  }
  onChange: (data: any) => void
}

export function HyperparametersForm({ hyperparameters, onChange }: HyperparametersFormProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...hyperparameters, [field]: value })
  }

  const handleEarlyStoppingChange = (field: string, value: any) => {
    onChange({
      ...hyperparameters,
      earlyStopping: { ...hyperparameters.earlyStopping, [field]: value },
    })
  }

  const handleNeuronsChange = (index: number, value: number) => {
    const newNeurons = [...hyperparameters.neuronsPerLayer]
    newNeurons[index] = value
    onChange({ ...hyperparameters, neuronsPerLayer: newNeurons })
  }

  const addLayer = () => {
    onChange({
      ...hyperparameters,
      neuronsPerLayer: [...hyperparameters.neuronsPerLayer, 32],
    })
  }

  const removeLayer = () => {
    if (hyperparameters.neuronsPerLayer.length > 1) {
      onChange({
        ...hyperparameters,
        neuronsPerLayer: hyperparameters.neuronsPerLayer.slice(0, -1),
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary-500" />
          Parâmetros de Treinamento
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Arquitetura da Rede */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Arquitetura da Rede
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Camadas ocultas</Label>
              <Input
                type="number"
                value={hyperparameters.hiddenLayers}
                onChange={(e) => handleChange('hiddenLayers', parseInt(e.target.value))}
                min={1}
                max={10}
              />
            </div>
            <div className="space-y-2">
              <Label>Dropout rate</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="0.5"
                value={hyperparameters.dropoutRate}
                onChange={(e) => handleChange('dropoutRate', parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* Neurônios por camada */}
          <div className="space-y-2">
            <Label>Neurônios por camada</Label>
            {hyperparameters.neuronsPerLayer.map((neurons, index) => (
              <div key={index} className="flex gap-2 items-center">
                <span className="text-sm text-gray-500 w-8">L{index + 1}</span>
                <Input
                  type="number"
                  value={neurons}
                  onChange={(e) => handleNeuronsChange(index, parseInt(e.target.value))}
                  min={8}
                  max={512}
                  step={8}
                />
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={addLayer}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                + Adicionar camada
              </button>
              <button
                type="button"
                onClick={removeLayer}
                className="text-xs text-error hover:text-error/80"
              >
                - Remover última camada
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Função de ativação</Label>
            <Select value={hyperparameters.activation} onValueChange={(value: string) => handleChange('activation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relu">ReLU</SelectItem>
                <SelectItem value="tanh">Tanh</SelectItem>
                <SelectItem value="sigmoid">Sigmoid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Treinamento */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Treinamento
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Batch size</Label>
              <Input
                type="number"
                value={hyperparameters.batchSize}
                onChange={(e) => handleChange('batchSize', parseInt(e.target.value))}
                min={8}
                max={512}
                step={8}
              />
            </div>
            <div className="space-y-2">
              <Label>Épocas</Label>
              <Input
                type="number"
                value={hyperparameters.epochs}
                onChange={(e) => handleChange('epochs', parseInt(e.target.value))}
                min={10}
                max={1000}
              />
            </div>
            <div className="space-y-2">
              <Label>Learning rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                max="0.1"
                value={hyperparameters.learningRate}
                onChange={(e) => handleChange('learningRate', parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Otimizador</Label>
              <Select value={hyperparameters.optimizer} onValueChange={(value: string) => handleChange('optimizer', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adam">Adam</SelectItem>
                  <SelectItem value="sgd">SGD</SelectItem>
                  <SelectItem value="rmsprop">RMSprop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Validação */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Validação
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Função de perda (Loss)</Label>
              <Select value={hyperparameters.lossFunction} onValueChange={(value: string) => handleChange('lossFunction', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mse">MSE (Mean Squared Error)</SelectItem>
                  <SelectItem value="mae">MAE (Mean Absolute Error)</SelectItem>
                  <SelectItem value="huber">Huber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validação cruzada (%)</Label>
              <Input
                type="number"
                step="5"
                min="5"
                max="50"
                value={hyperparameters.validationSplit}
                onChange={(e) => handleChange('validationSplit', parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Early Stopping */}
          <div className="space-y-3 pt-2 border-t border-dark-300">
            <div className="flex items-center justify-between">
              <Label>Early Stopping</Label>
              <Switch
                checked={hyperparameters.earlyStopping.enabled}
                onCheckedChange={(checked) => handleEarlyStoppingChange('enabled', checked)}
              />
            </div>
            {hyperparameters.earlyStopping.enabled && (
              <div className="space-y-2">
                <Label>Paciência (épocas)</Label>
                <Input
                  type="number"
                  value={hyperparameters.earlyStopping.patience}
                  onChange={(e) => handleEarlyStoppingChange('patience', parseInt(e.target.value))}
                  min={3}
                  max={50}
                />
                <p className="text-xs text-gray-500">
                  Interrompe o treinamento se não houver melhora após N épocas
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}