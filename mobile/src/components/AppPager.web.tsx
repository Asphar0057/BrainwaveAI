import { Children, forwardRef, useImperativeHandle, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type AppPagerHandle = {
  setPage: (index: number) => void;
};

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  overdrag?: boolean;
  scrollEnabled?: boolean;
};

const AppPager = forwardRef<AppPagerHandle, Props>(function AppPager(
  { children, style, initialPage = 0, onPageSelected },
  ref,
) {
  const pages = Children.toArray(children);
  const [page, setPageState] = useState(initialPage);

  const setPage = (nextPage: number) => {
    const safePage = Math.max(0, Math.min(nextPage, pages.length - 1));
    setPageState(safePage);
    onPageSelected?.({ nativeEvent: { position: safePage } });
  };

  useImperativeHandle(ref, () => ({ setPage }), [pages.length, onPageSelected]);

  return (
    <View style={[{ flex: 1, minWidth: 0, minHeight: 0 }, style]}>
      {pages.map((child, index) => (
        <View key={index} style={{ flex: 1, display: index === page ? 'flex' : 'none' }}>
          {child}
        </View>
      ))}
    </View>
  );
});

export default AppPager;
