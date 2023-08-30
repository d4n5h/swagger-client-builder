# Swagger API Client Builder

Automatically generate an API client on top of Axios using Swagger JSON document.
Basically using the Swagger document to generate a client in reverse.

1. It uses the Swagger schema for input validation and it resolves all the schema references.

2. It automatically gets the content-type from the requestBody and converts the body accordingly, if there's no content-type to the requestBody then it will fallback to JSON.

3. If operationIds are defined, it will use them as method names, or you can use `.get("/path/name/{id}")` / `.post("/path/name")`, etc...

4. It will try to resolve the protocol, host and base path. But if the Swagger document doesn't contain them then you'll need to define them in the axios config.

5. Don't use operationIds that are like method types (e.g "get", "post", "put", "delete", etc...)

6. Currently it supports Swagger v2 and OpenAPI v3, but it might support other versions. If it doesn't then you can open an issue or create a pull request.

## Install

```bash
npm install swagger-client-builder
```

### Or

```bash
yarn add swagger-client-builder
```

## Example

```javascript
const SwaggerClientBuilder = require("swagger-client-builder");
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
            },
            /*
            query:{},
            body:{},
            options:{
                // Axios request options
                headers:{...}
            }
            */
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
