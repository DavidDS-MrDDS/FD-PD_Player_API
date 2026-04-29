const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        body: JSON.parse(body || '{}')
                    });
                } catch {
                    resolve({
                        statusCode: res.statusCode,
                        body
                    });
                }
            });
        });
        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function runTests() {
    const username = 'testuser_' + Date.now();
    const email = `test_${Date.now()}@example.com`;
    const password = 'password123';
    let token;

    console.log('--- Starting Verification ---');

    // 1. Register
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3001,
            path: '/api/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username, email, password });

        console.log('Register:', res.statusCode === 201 ? 'PASS' : 'FAIL', res.body);
    } catch (err) {
        console.error('Register Error:', err);
    }

    // 2. Login
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3001,
            path: '/api/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { email, password });

        console.log('Login:', res.statusCode === 200 ? 'PASS' : 'FAIL', res.body);

        if (res.statusCode === 200) {
            token = res.body.token;
        }
    } catch (err) {
        console.error('Login Error:', err);
    }

    // 3. Protected Route
    if (token) {
        try {
            const res = await request({
                hostname: 'localhost',
                port: 3001,
                path: '/api/protected',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log('Protected Route:', res.statusCode === 200 ? 'PASS' : 'FAIL', res.body);
        } catch (err) {
            console.error('Protected Route Error:', err);
        }
    } else {
        console.log('Skipping Protected Route test due to login failure.');
    }

    // 4. Invalid Login
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3001,
            path: '/api/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { email, password: 'wrongpassword' });

        console.log('Invalid Login:', res.statusCode === 401 ? 'PASS' : 'FAIL', res.body);
    } catch (err) {
        console.error('Invalid Login Error:', err);
    }
}

setTimeout(runTests, 2000);