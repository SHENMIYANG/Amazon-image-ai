import fetch from 'node-fetch'

const testAgentAnalyze = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/agent-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productName: 'Test Product',
        category: 'Electronics',
        marketplace: 'US',
        dimensions: '10x10x5 cm',
        material: 'Plastic',
        targetAudience: 'Adults',
        competitorAsin: 'B08XYZ123',
        sellingPoints: ['Fast charging', 'Durable design', 'Compact size'],
        imageType: 'basic',
        imagePlans: []
      })
    })

    console.log('Response status:', response.status)
    console.log('Response headers:', response.headers.raw())
    
    const text = await response.text()
    console.log('Response text:', text)
    
    try {
      const json = JSON.parse(text)
      console.log('Parsed JSON:', json)
    } catch (e) {
      console.log('Not valid JSON:', e.message)
    }
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testAgentAnalyze()
