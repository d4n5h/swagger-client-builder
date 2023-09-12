const SwaggerClientBuilder = require("../index");

const Client = new SwaggerClientBuilder('https://petstore3.swagger.io/api/v3/openapi.json', {
    baseURL: 'https://petstore3.swagger.io/api/v3'
})

describe("Requests Testing", () => {
    test("Should throw an error if swagger file is invalid", async () => {
        await expect(async () => {
            const Client = new SwaggerClientBuilder('asd')
            await Client.build();
        }).rejects.toThrowError();
    });

    test("Should build client", async () => {
        await Client.build();
        expect(Client).toHaveProperty("paths");
    });

    test('Should throw validation error', async () => {
        await Client.build();
        await expect(async () => {
            await Client.getPetById({
                params: {},
            });
        }).rejects.toThrowError();
    });

    test('Response status should be 200', async () => {
        await Client.build();

        const response = await Client.getPetById({
            params: { petId: 12 },
        });

        expect(response.status).toBe(200);
    })

    test('Export client', async () => {
        await Client.build();

        const output = await Client.export('./test/client.js', {
            validation: true,
        });

        expect(output).toHaveProperty('code');
    })
});
