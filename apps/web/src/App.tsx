import { Button } from '@every-time/ui'
import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Every Time
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            UI Constrained Like CAD Parametrics
          </p>
          <p className="text-lg text-gray-500 mb-12">
            Regeneration Within Constraint
          </p>
          
          <div className="space-y-4">
            <div className="flex justify-center space-x-4">
              <Button 
                onClick={() => setCount(count + 1)}
                variant="primary"
              >
                Count is {count}
              </Button>
              <Button 
                onClick={() => setCount(0)}
                variant="outline"
              >
                Reset
              </Button>
            </div>
            
            <div className="flex justify-center space-x-4">
              <Button variant="secondary" size="sm">
                Small
              </Button>
              <Button variant="secondary" size="md">
                Medium
              </Button>
              <Button variant="secondary" size="lg">
                Large
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App 