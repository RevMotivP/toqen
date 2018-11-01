class QliteExceptionWrapper extends Qlite {

    constructor(ql_api_url) {
        error_wrap_object(super(ql_api_url));
    }

    _send(request, callback) {
        super._send(request, function (res, err) {
            if (err) {
                console.log(err);
                handle_error("ERROR: '" + err['statusText'] + "' (full error report in your browser console)");
            }
            else if(!res['success']) {
                handle_error(res['error']);
                err = res;
                res = null;
            }
            callback(res, err);
        });
    }
}

function error_wrap_method(method) {

    return function () {
        try {
            return fn.apply(this, this.arguments);
        } catch (err) {
            handle_error(err);
        }
    };
}

function error_wrap_object (object) {
    for (var x in object)  {
        if (typeof(object[x]) === "function") {
            object[x] = error_wrap_method(object[x]);
        }
    }
}

function handle_error(err) {
    toastr.error(err);
}