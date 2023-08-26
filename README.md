# swagger-client-builder

Automatically generates an API client on top of Axios using Swagger JSON document.
It uses the Swagger schema for input validation.
It will automatically get the content-type and convert the body accordingly.

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

        const Client = new SwaggerApiClientBuilder(swaggerJson, {
            // Your Axios config
            baseURL: "http://localhost",
            headers: {
                Authorization: "Bearer " + "<TOKEN>",
            },
        }).build();

        await Client['/path/of/endpoint/{id}'].post({
            params: {
                id: 1,
            },
            query:{
                order:'ASC'
            },
            body: {
                title: 'Example'
            },
        });

        console.log(response.data);
    } catch (error) {
        console.log(error);
    }
}

main();
```
