package app.architech;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BrowserAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
