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
const SwaggerClientBuilder = require("swagger-client-builder"");
const axios = require("axios");
async function main() {
    try {
        const swaggerJson = await axios.get('https://petstore.swagger.io/v2/swagger.json');

        const Client = new SwaggerClientBuilder(swaggerJson.data, {
            headers: {
                Authorization: "Bearer " + "<TOKEN>",
            },
        }).build();

        const response = await Client['/pet/{petId}'].get({
            params: {
                petId: 1,
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
