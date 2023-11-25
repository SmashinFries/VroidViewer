import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

type HeadingProps = {
    title: string;
    styles?: StyleProp<TextStyle>;
};
export const Heading = ({ title, styles }: HeadingProps) => {
    return (
        <Text style={[styles, { fontSize: 24, fontWeight: 'bold', textAlign: 'center' }]}>
            {title}
        </Text>
    );
};
