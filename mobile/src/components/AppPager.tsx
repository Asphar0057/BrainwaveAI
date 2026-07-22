import { forwardRef, useImperativeHandle, useRef } from 'react';
import NativePager from 'react-native-pager-view';

export type AppPagerHandle = {
  setPage: (index: number) => void;
};

type Props = React.ComponentProps<typeof NativePager>;

const AppPager = forwardRef<AppPagerHandle, Props>(function AppPager(props, ref) {
  const nativeRef = useRef<NativePager>(null);
  useImperativeHandle(ref, () => ({
    setPage: (index: number) => nativeRef.current?.setPage(index),
  }), []);
  return <NativePager ref={nativeRef} {...props} />;
});

export default AppPager;
