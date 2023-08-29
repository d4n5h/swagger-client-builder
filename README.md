# swagger-client-builder

Automatically generates an API client on top of Axios using Swagger JSON document.
It uses the Swagger schema for input validation.
It will automatically gets the content-type from the requestBody and converts the body accordingly.

Install:

```bash
npm install swagger-client-builder
```

Or:

```bash
yarn add swagger-client-builder
```

Example:

```javascript
const SwaggerClientBuilder = require("swagger-client-builder"");
const axios = require("axios");

async function main() {
    try {
        const swaggerJson = await axios.get('https://petstore3.swagger.io/api/v3/openapi.json');

        const Client = new SwaggerClientBuilder(swaggerJson.data, {
            // Optional: Axios instance config
            baseURL: 'https://petstore3.swagger.io/api/v3'
        })

        const response = await Client.get('/pet/{petId}', {
            params: {
                petId: 1,
            }
        });

        // Or (if operationId is defined in swagger)

        const response2 = await Client.getPetById({
            params: { petId: 1 },
        });
        
        console.log(response.data);

    } catch (error) {
        console.log(error);
    }
}

main();
```
