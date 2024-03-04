import { motion, useInView, useAnimation} from 'framer-motion';
import { useEffect, useRef } from 'react';

export const Revel = ({ children }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    const mainControls = useAnimation();
    const slideControls = useAnimation();

    useEffect(() => {
        if(isInView){
            mainControls.start('visible');
            slideControls.start('visible') 
        }

    },[isInView])

    return (
        <div ref={ref} style={{ position: 'relative', overflow: 'hidden' }}>
            <motion.div
                variants={{
                    hidden: { opacity: 0, y: 75 },
                    visible: { opacity: 1, y: 0 },
                }}
                initial="hidden"
                animate={mainControls}
                transition={{ duration: 0.5, delay: 0.25 }}
            >
                {children}
            </motion.div>
            <motion.div
                variants={{
                    hidden: {right: 0 },
                    visible: { right:"100%"},
                }}
                initial="hidden"
                animate={slideControls}
                transition={{ duration: 0.5, ease: "easeIn" }}
                style={{position:'absolute', top:4, bottom:4, left:0, right:0,}}
                className='absolute z-20 bg-[#9400D3]'
            >
            </motion.div>
        </div>
    )
}