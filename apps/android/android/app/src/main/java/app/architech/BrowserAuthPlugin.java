package app.architech;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BrowserAuth")
public class BrowserAuthPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        try {
            Uri target = Uri.parse(call.getString("url", ""));
            Uri server = Uri.parse(getBridge().getServerUrl());
            if (!target.getScheme().equals(server.getScheme()) || !target.getAuthority().equals(server.getAuthority()) || !"/sign-in".equals(target.getPath())) {
                call.reject("Invalid sign-in address");
                return;
            }
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, target));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open the browser", error);
        }
    }
}
