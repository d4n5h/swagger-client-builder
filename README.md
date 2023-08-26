# swagger-client-builder

Automatically generates an API client on top of Axios using Swagger JSON document and uses its schema for input validation

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
const SwaggerApiClientBuilder = require("swagger-client-builder");

async function main() {
    try {
        const swaggerJson = require("./swagger.json");

        const builder = new SwaggerApiClientBuilder(swaggerJson, {
            // Your Axios config
            baseURL: "http://localhost",
            headers: {
                Authorization: "Bearer " + "<TOKEN>",
            },
        });

        const Client = builder.build();
        
        await Client.pathName['{id}'].post({
            params: {
                id: 1,
            },
            body: {
                title: 'Example'
            }
        });

        console.log(response.data);
    } catch (error) {
        console.log(error);
    }
}

main();
```
