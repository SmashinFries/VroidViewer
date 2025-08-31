import { useState } from "react";

export const useModal = () => {
    const [visible, setVisible] = useState(false);

    const onModalToggle = (show: boolean) => setVisible(show);

    return { visible, onModalToggle };
};