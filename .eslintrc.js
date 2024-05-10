module.exports = {
    extends: ["expo"],
	plugins: ['prettier', '@react-three/recommended'],
    rules: {
        indent: 'off',
		'linebreak-style': ['error', 'windows'],
		quotes: ['error', 'single', { allowTemplateLiterals: true, avoidEscape: true }],
		semi: ['error', 'always'],
		'prettier/prettier': ['error', { endOfLine: 'crlf' }],
		'react/function-component-definition': [2, { namedComponents: 'arrow-function' }],
    }
};