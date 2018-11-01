window.onerror = error;
toastr.options.timeOut = 12000;
var accounts_loaded = false;

const QLITE = new QliteExceptionWrapper(window.location.origin);
const QUBIC = "YWKDGCATGHTWIWNYSTMCGEBKXHTA9DK9MYSHZFTQYZSCUUQVRORLBUZRMXBAHCCSOTWBZEYWOLJVVJ999";
const $hashtable = $('#hashtable');
const $channels = $('#channels');
const $create_mhc_button = $('#create_mhc_button');
const $load_mhc_button = $('#load_mhc_button');

let sender = null, sender_index = 0;
const inputs = [], outputs = [];

if(get_cookie("intro_read") !== "true")
    $('#intro_screen').removeClass('hidden');

show_accounts();
monitor_mhqubic();

function create_account() {
    const $button = $('#button_create_account');
    action_start($button);
    QLITE.iam_create(function (res, err) {
        show_accounts();
        action_finish($button);
    });
}

function action_start($button) {
    $button.addClass("hidden");
    $('<img class="loading" src="imgs/loading.png" id="loading_'+$button.attr('id')+'" />').insertAfter($button);
}

function action_finish($button) {
    $button.removeClass("hidden");
    $('#loading_'+$button.attr('id')).remove();
}

function add_input(epoch) {

    if(inputs.length >= 5)
        return error("no more than 5 inputs allowed");

    const $button = $('#button_add_input');
    action_start($button);

    epoch = parseInt(epoch);
    QLITE.fetch_epoch(function (res, err) {

        action_finish($button);

        const json = fetched_epoch_to_json(res, epoch, "contain any transfers");
        if(!json) return;

        const value = find_input_value(json['transfers'], sender, sender_index);

        if(value === 0)
            return error("you did not receive any funds in epoch #" + epoch);

        remove_input(epoch);
        inputs.push({
            'epoch': epoch,
            'value': value
        });

        display_inputs();

    }, QUBIC, parseInt(epoch));
}

function fetched_epoch_to_json(res, epoch, expected_action) {

    if(!res) return null;

    if(res['last_completed_epoch'] < epoch) {
        error("epoch #" + epoch + " has not completed yet.")
        return null;
    }

    const fetch_result = res['fetched_epochs'][0]['result'];
    if(fetch_result === undefined) {
        if(expected_action != null)
            error("epoch #"+epoch+" did not reach quorum.");
        return null;
    }

    if(!fetch_result.startsWith("{")) {
        if(expected_action != null)
            error("epoch #" + epoch + " does not "+expected_action+", it says: " + fetch_result);
        return null;
    }

    return parse_result_to_json(fetch_result);
}

function remove_input(epoch) {
    for(let i = 0; i < inputs.length; i++) {
        if(parseInt(inputs[i]['epoch']) === epoch)
            inputs.splice(i, 1);
    }
    display_inputs();
}

function add_remainder() {
    let remainder_value = calc_total_input_value() - calc_total_output_value();
    if(remainder_value > 0) {
        add_output(sender, sender_index+1, remainder_value);
    }
}

function calc_total_input_value() {
    let total_input_value = 0;
    inputs.forEach(function (input) {
        total_input_value += input['value'];
    });
    return total_input_value;
}

function calc_total_output_value() {
    let total_output_value = 0;
    outputs.forEach(function (output) {
        total_output_value += output['value'];
    });
    return total_output_value;
}

function add_output(receiver, index, value) {

    index = parseInt(index);

    if(receiver === sender && index === sender_index)
        return error("addresses cannot be reused, please send to another index");

    if(outputs.length >= 5)
        return error("no more than 5 outputs allowed");

    const $button = $('#button_add_output');
    action_start($button);

    QLITE.iam_read(function (res, err) {

        action_finish($button);

        const type = (res && res['read'] && res['read']['type'] === 'qubic transaction') ? "QUBIC" : "IAM";
        value = (typeof value) === "string"
            ? parseInt(value.replace(",", "").replace(".", ""))
            : value;

        try {
            receiver = receiver.toUpperCase();
            _ParameterValidator.validate_tryte_sequence(receiver, 'receiver', 81, 81);
            _ParameterValidator.validate_integer(index, 'receiver index', 0, 2147483647);
            _ParameterValidator.validate_integer(value, 'value', 0, 2147483647);
        } catch (err) {
            error(err);
            return;
        }

        outputs.push({
            'receiver': receiver,
            'index': index,
            'value': value,
            'type': type
        });
        display_outputs();
    }, receiver, 0);
}

function display_inputs() {
    const $input_table = $('#input_table');
    var total_input_value = 0;

    $('.input_row').remove();

    inputs.forEach(function (element) {
        const $row = $("<tr>").addClass("input_row")
            .append($("<td>").text(element['epoch']))
            .append($("<td>").text(element['value'].toLocaleString()))
            .append($("<td>").append($("<input>")
                .attr("type", "button")
                .attr("value", "remove")
                .attr("onclick", "remove_input("+element['epoch']+");")));
        $input_table.append($row);
        total_input_value += element['value'];
    });

    $('#total_input_value').text(total_input_value.toLocaleString());
}

function display_outputs() {
    const $output_table = $('#output_table');
    var total_output_value = 0;

    $('.output_row').remove();

    for(let i = 0; i < outputs.length; i++) {
        const element = outputs[i];
        const $row = $("<tr>").addClass("output_row")
            .append(generate_channel_account_cell(element['receiver'], element['index'], false))
            .append($("<td>").text(element['type'] === "QUBIC" ? "Smart Contract" : "User Account"))
            .append($("<td>").text(element['value'].toLocaleString()))
            .append($("<td>").append($("<input>")
                .attr("type", "button")
                .attr("value", "remove")
                .attr("onclick", "outputs.splice("+i+", 1);display_outputs();")));
        $output_table.append($row);
        total_output_value += element['value'];
    }

    $('#total_output_value').text(total_output_value.toLocaleString());
}

function show_accounts() {
    const iams = $('#iams');

    $('.iam').remove();
    $('#iams input').remove();

    QLITE.iam_list(function (res, err) {

        if(err) return;

        res['list'].forEach(function (iam) {
            const icon = new Identicon(md5(iam), 128).toString();
            const $iam = $("<div>").addClass("iam")
                .append($("<div>").addClass("image").html('<img class="identicon" width=128 height=128 src="data:image/png;base64,' + icon + '"> '))
                .append($("<div>").addClass("id").text(iam))
                .append($("<input>")
                    .attr("type", "button")
                    .attr("value", "select")
                    .attr("onclick", "select_account('"+iam+"');"));
            iams.append($iam);
        });

        iams.append($("<input>")
            .attr("type", "button")
            .attr("value", "new")
            .attr("onclick", "create_account();"));

        accounts_loaded = true;
        if(accounts_loaded && mhqubic_loaded)
            $('#loading_screen').addClass("hidden");
    })
}

function select_account(iam) {
    show_page("account_index_page");
    if(iam === sender) return;
    sender = iam;
    $('#mhc_payer').val(iam);

    const icon = new Identicon(md5(iam), 60).toString();
    $('#account').html('<p>'+iam+'<label id="index"></label></p><img class="identicon" width=60 height=60 src="data:image/png;base64,' + icon + '"> ');

    $('#explorer_link_without_index').attr("href", "https://qubiota.com/toqen?account="+sender);
}

function select_account_index(index) {

    $('#loading_screen').removeClass("hidden");
    QLITE.qubic_consensus(function (res, err) {
        if(res && res['result']) {
            $('#loading_screen').addClass("hidden");
            const json = parse_result_to_json(res['result']);
            return error("this index has already been used in epoch #" + json['epoch']);
        }

        QLITE.iam_read(function (res, err) {

            $('#loading_screen').addClass("hidden");

            if(res && res['read']) {
                warning("you already sent a transfer from this index, promoting it again ...");
                promote_transfer(sender, index, "IAM");
                return;
            }

            inputs.splice(0, inputs.length);
            outputs.splice(0, outputs.length);
            display_outputs();
            display_inputs();
            show_page("transfer_page");

            sender_index = index;
            $('#explorer_link').attr("href", "https://qubiota.com/toqen?account="+sender+"&account_index="+sender_index);
            $('#account #index').text("/"+index);

        }, sender, index);
    }, QUBIC, sender.substr(0, 29)+"I", index);
}

function parse_result_to_json(result) {
    return JSON.parse(result.replace(new RegExp("'", 'g'), "\""));
}

function find_input_value(transfers, receiver, receiver_index) {
    var sum = 0;
    transfers.forEach(function (element) {
        if(element['receiver'] === receiver && element['index'] === receiver_index)
            sum += element['value'];
    });
    return sum;
}

function send_transfer() {

    if($('#total_output_value').text() !== $('#total_input_value').text()) {
        error("total input and output value need to match");
        return;
    }

    if($('#total_output_value').text() === "0") {
        error("transfer value is required to be greater than 0");
        return;
    }

    if(outputs.length > 5 || inputs.length > 5) {
        error("no more than 5 inputs and 5 outputs allowed");
        return;
    }

    const input_epochs = [];
    inputs.forEach(function (input) {
       input_epochs.push(input['epoch'])
    });

    const request = {
        "index": sender_index,
        "inputs": input_epochs,
        "outputs": outputs,
    };

    QLITE.iam_read(function (res, err) {

        if(res && res['read']) {
            warning("you already sent a transfer from this index, promoting it again ...");
            promote_transfer(sender, sender_index, "IAM");
            return;
        }

        QLITE.iam_write(function (res, err) {
            if(err) return;
            success("transfer sent, promoting ...");
            promote_transfer(sender, sender_index, "IAM");
        }, sender, sender_index, request);

    }, sender, sender_index);
}

function promote_transfer(sender, sender_index, type) {
    const promotion_message = {"sender": sender, "index": sender_index, "type": type};

    $('#loading_screen').removeClass("hidden");

    QLITE.qubic_consensus(function (res, err) {
        if(res && res['result']) {
            $('#loading_screen').addClass("hidden");
            return error("a transfer sent from this address has already confirmed, please select another index");
        }

        QLITE.import(function (res, err) {
            QLITE.iam_write(function (res, err) {
                $('#loading_screen').addClass("hidden");
                if(err) return;
                QLITE.iam_delete(function (res, err) { }, "AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999");
                success("transfer promoted");
            }, "AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999", 0, promotion_message);
        }, "i_AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999_GUACEZHVFAEZEYGUACEZGQFEFFGOAGHSDAHCFCEZGUACEZGDFAABABEYEVJVIDABGBJLFQGNICDRHUBCGSEEDWDZEOFPCDICHGEHHOEYCPGCHJAACCIBGKIZHPINHKGGIBETIJHHANIIESCLCRENCGGUEOCXBBIFJCDJABHFAAGBGYJFEKIWIQCDJBAZIABLBKBFBFEAFCJRFOGGCOHZCHBPDJEWCDCSFZEQHFIHDZCSBOBMFTFNFCETADEODFCRGCCPFAGZIEFRIKFUARGWEOJLELBUGPIRDJGOEHEKGGFBFXBDDDHSEZCTFAFTEYAXIQIAAPFTGHFJCYBYASCFACBIEDAEFJEIIIGAENFAABABEYEPDTBGAFDIBBHHDQCXCIBRIMHACEIHCFJPAUBVCHESHEECACERIHHWFJHHFFACIXIBIJIHAOCGDGIJHZDYJHFFFOABAACAHTFUJHGHEAHWGMFUFRCDDBFHGWAMCUBMDTHGFUJQALIEJSANGMDSBJBUGCGPBZBMJLARJEBJJVFJESGFGZISEJETISJQEZGIHFCYBKEJCKBOIBAQAJBOADDRDTIKDXBFFEASALIWIOAAJRIFGJIUEZHWHFEWDBHTGOFCFUFAFSHSARGICQJPCZJKFNELFDFIFMBFDHJCICIWHVGWHY");
    }, QUBIC, sender.substr(0, 30), sender_index);
}

function hide_intro() {
    document.cookie = "intro_read=true;";
    $('#intro_screen').addClass('hidden');
}

// credits to https://stackoverflow.com/a/15724300 (modified)
function get_cookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
    return null;
}

function success(msg) {
    console.log("INFO: " + msg);
    toastr.success(msg);
}

function warning(msg) {
    console.log("WARN: " + msg);
    toastr.warning(msg);
}

function error(msg) {
    console.error("ERR:  " + msg);
    toastr.error(msg);
}

function show_page(id) {
    $('.page').addClass("hidden");
    $('#'+id).removeClass("hidden");
}

// credits to https://stackoverflow.com/a/30905277 (modified)
function copy_to_clipboard(text) {
    const $temp = $("<input>");
    $("body").append($temp);
    $temp.val(text).select();
    document.execCommand("copy");
    $temp.remove();
}