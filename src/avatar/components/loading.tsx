import React from 'react';
import { View, ActivityIndicator } from 'react-native';

export const LoadingModel = ({ height }: { height: number }) => {
    return (
        <View
            style={{
                position: 'absolute',
                width: '100%',
                height: height,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'white',
            }}
        >
            <ActivityIndicator size="large" color="#0000ff" />
        </View>
    );
};
