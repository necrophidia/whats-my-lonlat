export default [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                fetch: "readonly",
                URLSearchParams: "readonly",
                L: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-console": "warn",
            "eqeqeq": "error",
            "no-var": "error",
            "prefer-const": "warn",
        },
    },
];
